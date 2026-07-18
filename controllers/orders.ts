import { Request, Response } from 'express';
import { AppDataSource } from '../config/database.js';
import { getTaiwanTime } from '../utils/date.js';
// import { Ticket as TicketEntity} from '../models/ticket.js';
import { TicketType as TicketTypeEntity} from '../models/ticket-type.js';
import { ConcertSession as ConcertSessionEntity} from '../models/concert-session.js';
import { handleErrorAsync, ApiError } from '../utils/index.js';
import { ApiResponse, ErrorCode } from '../types/api.js';
// import { Index } from 'typeorm';
import { Payment as PaymentEntity} from '../models/payment.js';
import crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';

import { Order, OrderStatus } from '../models/order.js';
import { v4 as uuidv4 } from 'uuid'; // 用來產生 lockToken
const { MERCHANTID, HASHKEY, HASHIV, HOST, REDIRECTURL} = process.env;

// 環境變數檢查
if (!MERCHANTID || !HASHKEY || !HASHIV || !HOST || !REDIRECTURL) {
  throw new Error('缺少必要的環境變數：MERCHANTID, HASHKEY, HASHIV, HOST, REDIRECTURL');
}

export const createOrder = handleErrorAsync(async (req: Request, res: Response<ApiResponse>) => {

  const { ticketTypeId, purchaserName, purchaserEmail, purchaserPhone } = req.body;
  // const authenticatedUser = req.user as Express.User; // 從 middleware 拿到 userId
  const authenticatedUser = req.user as { userId: string; role: string; email: string; };

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(ticketTypeId)) {
    throw ApiError.invalidFormat('票種 ID');
  }

  if (!purchaserName && !purchaserEmail && !purchaserPhone) {
    throw ApiError.create(400, '欄位未填寫完全', ErrorCode.DATA_INVALID);
  }

  if (purchaserPhone.length !== 10 && typeof purchaserPhone !== 'number' && !purchaserPhone.startsWith('09')) {
    throw ApiError.invalidFormat('手機號碼');
  }

  const ticketTypeRepository = AppDataSource.getRepository(TicketTypeEntity);

  const selectedTicket = await ticketTypeRepository.findOne({
    where: { ticketTypeId },
    select: ['ticketTypeName', 'totalQuantity', 'remainingQuantity', 'sellBeginDate', 'sellEndDate'],
  });

  if (!selectedTicket) {
    throw ApiError.notFound('演唱會票券');
  }

  const now = getTaiwanTime();
  if (now < selectedTicket.sellBeginDate || now > selectedTicket.sellEndDate) {
    throw ApiError.outOfTimeRange(selectedTicket.ticketTypeName);
  }

  // 設定 lock 時間（15 分鐘後過期）
  const lockExpireTime = new Date(now.getTime() + 15 * 60 * 1000);

  // 扣庫存 → 建訂單 包在同一個 transaction：任一步失敗全部 rollback，
  // 避免「庫存已扣、訂單未建立」的資料不一致
  const savedOrder = await AppDataSource.transaction(async (manager) => {
    const txTicketTypeRepository = manager.getRepository(TicketTypeEntity);
    const txOrderRepository = manager.getRepository(Order);

    // 扣庫存（原子條件式 UPDATE，維持 remainingQuantity > 0 檢查，避免超賣）
    const updateResult = await txTicketTypeRepository
      .createQueryBuilder()
      .update(TicketTypeEntity)
      .set({ remainingQuantity: () => 'remainingQuantity - 1' })
      .where('ticketTypeId = :id', { id: ticketTypeId })
      .andWhere('remainingQuantity > 0')
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      throw ApiError.dataConstraintViolation('票券已售罄');
    }

    // orderId 預先產生 + orderNumber 於 create 時一併生成，
    // 合併原本「save 後再 update orderNumber」的兩次寫入
    const orderId = uuidv4();
    const orderNumber = generateOrderNumber(now, orderId);

    // 創建新訂單（createdAt/updatedAt 由 @BeforeInsert 自動設定台灣時間）
    const newOrder = txOrderRepository.create({
      orderId,
      ticketTypeId,
      userId: authenticatedUser.userId,
      orderStatus: 'held' as OrderStatus,
      isLocked: true,
      lockToken: uuidv4(),
      lockExpireTime,
      purchaserName,
      purchaserEmail,
      purchaserPhone,
      orderNumber,
    });

    return txOrderRepository.save(newOrder);
  });


  return res.status(200).json({
    status: 'success',
    message: '訂單創建成功',
    data: {
      orderId: savedOrder.orderId,
      lockExpireTime: savedOrder.lockExpireTime,
    },
  }); 
});

export const refundOrder = handleErrorAsync(async (req: Request, res: Response<ApiResponse>) => {

  const body = req.body;
  const { orderId } = req.params;
  if (orderId !== body.orderId) {
    throw ApiError.create(400, '訂單編號錯誤', ErrorCode.DATA_INVALID);
  }
  // const authenticatedUser = req.user as Express.User; // 從 middleware 拿到 userId
  const authenticatedUser = req.user as { userId: string; role: string; email: string; };


  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderId)) {
    throw ApiError.invalidFormat('票種 ID');
  }

  const orderRepository = AppDataSource.getRepository(Order);

  const selectedOrder = await orderRepository.findOne({
    where: { orderId }
  });

  if (!selectedOrder) {
    throw ApiError.notFound('訂單 ID');
  }

  // 使用者不同要回傳forbidden
  if (selectedOrder.userId !== authenticatedUser.userId) {
    throw ApiError.forbidden();
  }

  const ticketTypeRepository = AppDataSource.getRepository(TicketTypeEntity);
  const ticketType = await ticketTypeRepository.findOneBy({ ticketTypeId: selectedOrder.ticketTypeId });
  if (!ticketType) {
    throw ApiError.notFound('票種');
  }
  const ConcertSessionRepository = AppDataSource.getRepository(ConcertSessionEntity);
  const ConcertSession = await ConcertSessionRepository.findOneBy({ sessionId: ticketType.concertSessionId });
  if (!ConcertSession || !ConcertSession.sessionDate) {
    throw ApiError.notFound('演唱會場次資料');
  }
  
  const startTime = ConcertSession.sessionDate;
  const refundDeadline = new Date(startTime);
  refundDeadline.setDate(refundDeadline.getDate() - 7);
  const now = getTaiwanTime();
  const afterRefundDeadline = now > refundDeadline;

  if (afterRefundDeadline) {
    throw ApiError.create(403, '此訂單不可退款', ErrorCode.AUTH_FORBIDDEN);
  }

  const paymentRepository = AppDataSource.getRepository(PaymentEntity);
  const selectedPayment = await paymentRepository.findOne({
    where: { orderId },
    relations: [ 'order' ]
  });

  if (!selectedPayment) {
    throw ApiError.notFound('支付記錄');
  }

  if (selectedPayment.status !== 'completed'){
    throw ApiError.forbidden();
  }

  let TradeNo = selectedPayment.tradeNo;
  
  if (TradeNo === ''){
    throw ApiError.notFound('綠界交易編號');
  }

  const MerchantTradeNo = selectedPayment.transactionId;
  const TotalAmount = Number(selectedPayment.amount).toString();
  const data: Record<string, any> = {
    MerchantID: MERCHANTID,
    MerchantTradeNo: MerchantTradeNo,
    TradeNo: TradeNo,
    Action: 'R', // R=退款, C=取消授權
    TotalAmount: TotalAmount
  };

  data.CheckMacValue = generateCheckMacValue(data);
  const apiUrl = 'https://payment-stage.ecpay.com.tw/CreditDetail/DoAction';
  
  try {
    const response: AxiosResponse<string> = await axios.post(apiUrl, 
      new URLSearchParams(data).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    if (response.status !== 200) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    const result: Record<string, string> = {};
    const pairs = response.data.split('&');
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        result[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
    if (result.RtnCode === '1' ){
      selectedOrder.orderStatus = 'refunded';
      selectedOrder.updatedAt = getTaiwanTime();
      await orderRepository.save(selectedOrder);
      selectedPayment.status = 'refunded';
      selectedPayment.updatedAt = getTaiwanTime();
      await paymentRepository.save(selectedPayment);
    }
    else {
      throw ApiError.create(400, '申請退款失敗', ErrorCode.DATA_INVALID);
    }
    const now = getTaiwanTime();

    const isInSalePeriod = now >= ticketType.sellBeginDate && now <= ticketType.sellEndDate;
    if (isInSalePeriod) {
      // 原子遞增，避免併發退款時 read-modify-write 造成 lost update
      await ticketTypeRepository.increment(
        { ticketTypeId: ticketType.ticketTypeId },
        'remainingQuantity',
        1
      );
    }

    return res.status(200).json({
      status: 'success',
      message: '退款申請成功'
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Request Error: ${error.message}`);
    }
    throw error;
  }  
});

export const getOrderInfo = handleErrorAsync(async (req: Request, res: Response<ApiResponse>) => {
  const authenticatedUser = req.user as { userId: string; role: string; email: string; };
  const { orderId } = req.params;
  const orderRepository = AppDataSource.getRepository(Order);

  const result = await orderRepository
    .createQueryBuilder('order')
    .leftJoinAndSelect('order.ticketType', 'ticketType')
    .leftJoinAndSelect('ticketType.concertSession', 'concertSession')
    .leftJoinAndSelect('concertSession.concert', 'concert')
    .where('order.orderId = :orderId', { orderId })
    .andWhere('order.userId = :userId', { userId: authenticatedUser.userId })
    .getOne();

  if (!result) {
    throw ApiError.notFound('訂單');
  }

  // 只回傳 order 本身（不帶 ticketType 等巢狀物件）
  const { ticketType, ...orderOnly } = result;
  void ticketType; // 避免 linter 警告
  return res.status(200).json({
    status: 'success',
    message: '訂單資訊取得成功',
    data: {
      order: orderOnly,
      concert: result.ticketType?.concertSession?.concert || null
    }
  });
});

function generateCheckMacValue(data: Record<string, any>): string {
    // 移除CheckMacValue
    const {  ...cleanData } = data;

    // 按照ASCII排序
    const sortedKeys = Object.keys(cleanData).sort();

    // 組合參數字串
    let checkStr = `HashKey=${HASHKEY}`;
    for (const key of sortedKeys) {
      checkStr += `&${key}=${cleanData[key]}`;
    }
    checkStr += `&HashIV=${HASHIV}`;
    // URL編碼
    let encodedStr = encodeURIComponent(checkStr).toLowerCase();

    // 轉換特殊字符
    encodedStr = encodedStr
      .replace(/%2d/g, '-')
      .replace(/%5f/g, '_')
      .replace(/%2e/g, '.')
      .replace(/%21/g, '!')
      .replace(/%2a/g, '*')
      .replace(/%28/g, '(')
      .replace(/%29/g, ')');

    // 產生雜湊值
    return crypto.createHash('sha256').update(encodedStr).digest('hex').toUpperCase();
  }

function generateOrderNumber(createdAt: Date, orderId: string): string {
  const yymmdd = createdAt.toISOString().slice(2, 10).replace(/-/g, '');
  const hhmmss = createdAt.toTimeString().slice(0, 8).replace(/:/g, '');
  const shortId = orderId.slice(-4).toUpperCase(); // 取 UUID 最後四碼
  return `${yymmdd}${hhmmss}-${shortId}`;
}
