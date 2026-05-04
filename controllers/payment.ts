import { Request, Response } from 'express';
import { AppDataSource } from '../config/database.js';
import { TicketType as TicketTypeEntity} from '../models/ticket-type.js';
import { Ticket as TicketEntity} from '../models/ticket.js';
import { ConcertSession as ConcertSessionEntity} from '../models/concert-session.js';
import { Payment as PaymentEntity} from '../models/payment.js';
import { Order as OrderEntity} from '../models/order.js';
import { handleErrorAsync, ApiError } from '../utils/index.js';
import { ApiResponse } from '../types/api.js';
import crypto from 'crypto';
const { MERCHANTID, HASHKEY, HASHIV, HOST, REDIRECTURL} = process.env;

// 環境變數檢查
if (!MERCHANTID || !HASHKEY || !HASHIV || !HOST || !REDIRECTURL) {
  throw new Error('缺少必要的環境變數：MERCHANTID, HASHKEY, HASHIV, HOST, REDIRECTURL');
}

export const getECpayurl = handleErrorAsync(async (req: Request, res: Response<ApiResponse>) => {
  const ecpay_payment: any = await import('ecpay_aio_nodejs').then(m => m.default || m);
  res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
  
  const orderId = req.params.orderId;
  const authenticatedUser = req.user as { userId: string; role: string; email: string; };
  
  // console.log('用戶信息:', authenticatedUser);
  // console.log('訂單ID:', orderId);
  
  if (!orderId) {
    throw ApiError.fieldRequired('orderId');
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(orderId)) {
    throw ApiError.invalidFormat('訂單 ID');
  }

  // 查找訂單
  const OrderRepository = AppDataSource.getRepository(OrderEntity);
  const selectedOrder = await OrderRepository.findOne({
    where: { orderId: orderId }
  });
  
  // console.log('訂單信息:', selectedOrder);
  if (!selectedOrder) {
    throw ApiError.notFound('訂單');
  }

  if (selectedOrder.userId !== authenticatedUser.userId) {
    throw ApiError.forbidden();
  }

  // 檢查訂單是否過期
  const now = new Date();
  if (now > selectedOrder.lockExpireTime) {
    throw ApiError.orderExpired(selectedOrder.orderId);
  }

  // 檢查是否已存在未完成的支付記錄
  const PaymentRepository = AppDataSource.getRepository(PaymentEntity);
  const existingPayment = await PaymentRepository.findOne({
    where: { orderId: selectedOrder.orderId, status: 'pending' }
  });
  
  if (existingPayment) {
    // console.log('發現現有的待處理支付記錄:', existingPayment.transactionId);
    // 可以選擇返回現有的支付頁面或創建新的
  }

  // 獲取票種信息
  const ticketTypeRepository = AppDataSource.getRepository(TicketTypeEntity);
  const ticketTypeData = await ticketTypeRepository.findOne({
    where: { ticketTypeId: selectedOrder.ticketTypeId }
  });
  
  if (!ticketTypeData) {
    throw ApiError.notFound('票種');
  }
  
  // console.log('票種信息:', ticketTypeData);

  // 獲取演唱會場次信息
  const ConcertSessionRepository = AppDataSource.getRepository(ConcertSessionEntity);
  const ConcertSessionData = await ConcertSessionRepository.findOne({
    where: { sessionId: ticketTypeData.concertSessionId }
  });
  
  if (!ConcertSessionData) {
    throw ApiError.notFound('演唱會場次');
  }
  
  // console.log('演唱會場次信息:', ConcertSessionData);

  // ECPay 設定
  const options = {
    OperationMode: 'Test', // 生產環境時改為 'Production'
    MercProfile: {
      MerchantID: MERCHANTID,
      HashKey: HASHKEY,
      HashIV: HASHIV,
    },
    IgnorePayment: [],
    IsProjectContractor: false,
  };

  const payment = new ecpay_payment(options);
  const MerchantTradeDate = getMerchantTradeDate();
  // console.log('交易時間:', MerchantTradeDate);
  
  const sessionTitle = ConcertSessionData.sessionTitle;
  const sessionDate = ConcertSessionData.sessionDate;
  let TradeDesc = '';
  
  if (sessionTitle) {
    TradeDesc += sessionTitle;
  }

  if (sessionDate) {
    TradeDesc += ` ${sessionDate.toString()}`;
  }

  // 確保金額為正整數
  let TotalAmount = ticketTypeData.ticketTypePrice;
  if (!TotalAmount || TotalAmount <= 0) {
    throw ApiError.invalidFormat('票價');
  }
  TotalAmount = Math.floor(TotalAmount);
  
  // 生成唯一的交易編號
  const MerchantTradeNo = `${orderId.slice(0, 6)}${Date.now()}`;
  
  // 檢查交易編號是否已存在
  const existingTransaction = await PaymentRepository.findOne({
    where: { transactionId: MerchantTradeNo }
  });
  
  if (existingTransaction) {
    throw new Error(`交易編號 ${MerchantTradeNo} 已存在`);
  }

  // 創建支付記錄
  const paymentRecord = PaymentRepository.create({
    orderId: selectedOrder.orderId,
    method: 'ECPay',
    provider: 'ECPay',
    status: 'pending',
    amount: TotalAmount,
    currency: 'TWD',
    transactionId: MerchantTradeNo,
    createdAt: new Date(),
  });
  
  await PaymentRepository.save(paymentRecord);
  // console.log('支付記錄已創建:', MerchantTradeNo);

  const ItemName = ticketTypeData.ticketTypeName || '演唱會門票';
  
  // 限制欄位長度以符合 ECPay 規範
  const limitedTradeDesc = TradeDesc.length > 200 ? TradeDesc.substring(0, 200) : TradeDesc;
  const limitedItemName = `${limitedTradeDesc} ${ItemName}`.length > 400 
    ? `${limitedTradeDesc} ${ItemName}`.substring(0, 400) 
    : `${limitedTradeDesc} ${ItemName}`;

  const base_param = {
    MerchantTradeNo: MerchantTradeNo,
    MerchantTradeDate: MerchantTradeDate,
    TotalAmount: TotalAmount.toString(),
    TradeDesc: limitedTradeDesc,
    ItemName: limitedItemName,
    ReturnURL: `${HOST}`,
    PaymentType: 'aio',
    ChoosePayment: 'Credit',
    IgnorePayment: 'ATM#CVS#BARCODE#WebATM',
    ClientBackURL: `${REDIRECTURL}?oId=${orderId}`
  };

  // console.log('ECPay 參數:', base_param);
  
  try {
    const html = payment.payment_client.aio_check_out_credit_onetime(base_param, {}, {});
    res.render('ecpay', { html });
  } catch (error) {
    console.error('ECPay 支付頁面生成失敗:', error);
    // 支付創建失敗時，將支付記錄標記為失敗
    paymentRecord.status = 'failed';
    await PaymentRepository.save(paymentRecord);
    res.status(500).json({ 
      status: 'failed', 
      message: '支付頁面產生失敗，請稍後再試' });
return;

  }
});

export const getECpayReturn = handleErrorAsync(async (req: Request, res: Response) => {
  const raw = req.body;
  // console.log('ECPay 回調數據:', raw);

  if (!raw || !raw.MerchantTradeNo) {
    throw new Error('無效的回調數據');
  }

  const merchantTradeNo = raw.MerchantTradeNo;
  
  // 驗證 CheckMacValue
  if (!HASHKEY || !HASHIV) {
    throw new Error('缺少 HASHKEY 或 HASHIV 環境變數');
  }
  
  const checkMac = generateCheckMacValue(raw, HASHKEY, HASHIV);
  // console.log('計算的 CheckMacValue:', checkMac);
  // console.log('ECPay 的 CheckMacValue:', raw.CheckMacValue);

  if (checkMac !== raw.CheckMacValue) {
    console.error('CheckMacValue 驗證失敗');
    throw new Error('CheckMacValue 驗證失敗');
  }

  // 使用事務處理確保數據一致性
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. 更新 Payment 記錄
    const PaymentRepository = queryRunner.manager.getRepository(PaymentEntity);
    const payment = await PaymentRepository.findOne({
      where: { transactionId: merchantTradeNo }
    });

    if (!payment) {
      throw ApiError.notFound('支付記錄');
    }

    // 防止重複處理
    if (payment.status !== 'pending') {
      // console.log(`支付記錄 ${merchantTradeNo} 已處理，狀態: ${payment.status}`);
      await queryRunner.commitTransaction();
      res.send('1|OK');
      return;
    }

    const isSuccess = raw.RtnCode === '1';
    payment.status = isSuccess ? 'completed' : 'failed';
    payment.paidAt = raw.PaymentDate ? new Date(raw.PaymentDate) : new Date();
    payment.rawPayload = raw;
    payment.updatedAt = new Date();
    payment.tradeNo = raw.TradeNo;


    

    await PaymentRepository.save(payment);
    // console.log(`支付記錄已更新: ${merchantTradeNo}, 狀態: ${payment.status}`);

    // 只有在支付成功時才處理訂單和票券
    if (isSuccess) {
      // 2. 查詢並更新 Order 狀態
      const OrderRepository = queryRunner.manager.getRepository(OrderEntity);
      const order = await OrderRepository.findOne({
        where: { orderId: payment.orderId, isLocked: true },
      });

      if (!order) {
        throw new Error(`找不到訂單：${payment.orderId}`);
      }

      // 只允許 held → paid 的狀態轉換
      if (order.orderStatus !== 'held') {
        console.warn(`訂單 ${order.orderId} 狀態為 ${order.orderStatus}，不允許轉為 paid`);
        await queryRunner.commitTransaction();
        res.send('1|OK');
        return;
      }

      order.orderStatus = 'paid';
      order.updatedAt = new Date();
      await OrderRepository.save(order);
      // // console.log(`訂單 ${order.orderId} 狀態已更新為 paid`);

      // 3. 創建票券
      const TicketRepository = queryRunner.manager.getRepository(TicketEntity);
      const TicketTypeRepository = queryRunner.manager.getRepository(TicketTypeEntity);
      const ConcertSessionRepository = queryRunner.manager.getRepository(ConcertSessionEntity);
      
      const ticketType = await TicketTypeRepository.findOne({
        where: { ticketTypeId: order.ticketTypeId }
      });

      if (!ticketType) {
        throw ApiError.notFound('票種');
      }

      const session = await ConcertSessionRepository.findOne({
        where: { sessionId: ticketType.concertSessionId }
      });

      if (!session) {
        throw ApiError.notFound('演唱會場次');
      }

      // 檢查是否已經有票券（防止重複創建）
      const existingTicket = await TicketRepository.findOne({
        where: { orderId: order.orderId }
      });

      if (!existingTicket) {
        const ticket = TicketRepository.create({
          orderId: order.orderId,
          userId: order.userId,
          ticketTypeId: order.ticketTypeId,
          status: 'purchased',
          purchaseTime: new Date(),
          concertStartTime: session.sessionDate,
          purchaserName: order.purchaserName,
          purchaserEmail: order.purchaserEmail,
          seatNumber: null,
          qrCode: `TICKEASY|${order.userId}|${order.orderId}`,
        });

        await TicketRepository.save(ticket);
        // // console.log(`為訂單 ${order.orderId} 創建票券成功`);
      } else {
        // // console.log(`訂單 ${order.orderId} 的票券已存在，跳過創建`);
      }
    }

    await queryRunner.commitTransaction();
    // console.log('交易處理完成');
    
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('交易處理失敗，已回滾:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }

  res.send('1|OK');
});

function getMerchantTradeDate(date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

/**
 * 產生綠界格式的 CheckMacValue
 */
function generateCheckMacValue(
  data: Record<string, string>,
  hashKey: string,
  hashIV: string
): string {
  // 1. 排除 CheckMacValue 欄位並按字典順序排序
  const filtered: Record<string, string> = {};
  Object.keys(data)
    .filter(key => key !== 'CheckMacValue')
    .sort((a, b) => a.localeCompare(b))
    .forEach(key => {
      filtered[key] = data[key];
    });

  // 2. 組成 query string
  let raw = `HashKey=${hashKey}&`;
  raw += Object.entries(filtered)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  raw += `&HashIV=${hashIV}`;

  // console.log('原始字符串:', raw);

  // 3. URL encode 並轉小寫，套用綠界特殊規則
  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%21/g, '!')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%2a/g, '*');

  // console.log('編碼後字符串:', encoded);

  // 4. SHA256 加密並轉大寫
  const hash = crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();

  return hash;
}