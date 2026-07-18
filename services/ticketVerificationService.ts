import { AppDataSource } from '../config/database.js';
import { Ticket as TicketEntity } from '../models/ticket.js';
import { Order as OrderEntity } from '../models/order.js';
import { ApiError } from '../utils/index.js';
import { ErrorCode } from '../types/api.js';

interface QRCodeData {
  userId: string;
  orderId: string;
}

interface VerificationResult {
  ticketId: string;
  purchaserName: string;
  ticketTypeName: string;
  concertTitle: string;
  concertDate: Date;
  verifiedAt: Date;
  verifiedBy: string;
  verifierType: string;
}



export class TicketVerificationService {
  private ticketRepository = AppDataSource.getRepository(TicketEntity);
  private orderRepository = AppDataSource.getRepository(OrderEntity);

  /**
   * 核銷票券主要方法
   */
  async verifyTicket(qrCode: string, verifierId: string, verifierRole: string, verifierEmail: string): Promise<VerificationResult> {
    // 1. 解析 QR Code
    const { userId, orderId } = this.validateAndParseQRCode(qrCode);

    // 2. 獲取訂單及相關數據（先檢查訂單，再檢查票券）
    const order = await this.getOrderWithAllRelations(userId, orderId);

    // 3. 驗證權限
    this.validateVerificationPermission(order, verifierId, verifierRole);

    // 4. 獲取票券資料
    const ticket = await this.getTicketWithRelations(userId, orderId);

    // 5. 驗證票券狀態
    this.validateTicketStatus(ticket);

    // 6. 驗證時間範圍
    this.validateVerificationTime(ticket);

    // 7. 執行核銷
    return await this.executeVerification(ticket, verifierId, verifierRole, verifierEmail);
  }

  /**
   * 驗證並解析 QR Code
   */
  private validateAndParseQRCode(qrCode: string): QRCodeData {
    if (!qrCode || typeof qrCode !== 'string') {
      throw ApiError.create(400, 'QR Code 格式錯誤', ErrorCode.INVALID_QR_FORMAT);
    }

    const parts = qrCode.split('|');
    if (parts.length !== 3 || parts[0] !== 'TICKEASY') {
      throw ApiError.create(400, 'QR Code 格式錯誤', ErrorCode.INVALID_QR_FORMAT);
    }

    const [, userId, orderId] = parts;
    
    // UUID 格式驗證
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId) || !uuidRegex.test(orderId)) {
      throw ApiError.create(400, 'QR Code 中的 ID 格式錯誤', ErrorCode.INVALID_UUID_FORMAT);
    }

    return { userId, orderId };
  }

  /**
   * 獲取訂單及所有相關數據
   */
  private async getOrderWithAllRelations(userId: string, orderId: string): Promise<any> {
    const order = await this.orderRepository.findOne({
      where: { orderId, userId },
      relations: [
        'ticketType',
        'ticketType.concertSession',
        'ticketType.concertSession.concert',
        'ticketType.concertSession.concert.organization'
      ]
    });

    if (!order) {
      throw ApiError.create(404, '找不到對應的訂單', ErrorCode.ORDER_NOT_FOUND);
    }

    if (!order.ticketType?.concertSession?.concert?.organization) {
      throw ApiError.create(500, '訂單關聯資料不完整', ErrorCode.SYSTEM_ERROR);
    }

    // 檢查訂單狀態
    if (order.orderStatus !== 'paid') {
      throw ApiError.create(400, `訂單狀態錯誤：${order.orderStatus}`, ErrorCode.INVALID_ORDER_STATUS);
    }

    return order;
  }

  /**
   * 獲取票券及相關數據
   */
  private async getTicketWithRelations(userId: string, orderId: string): Promise<any> {
    const ticket = await this.ticketRepository.findOne({
      where: { orderId, userId },
      relations: ['ticketType', 'ticketType.concertSession'],
      select: {
        ticketId: true,
        orderId: true,
        userId: true,
        status: true,
        purchaserName: true,
        concertStartTime: true,
        qrCode: true,
        ticketType: {
          ticketTypeName: true,
          concertSession: {
            sessionTitle: true,
            sessionDate: true,
            sessionEnd: true
          }
        }
      }
    });

    if (!ticket) {
      // 如果關聯查詢失敗，嘗試基本查詢
      const basicTicket = await this.ticketRepository.findOne({
        where: { orderId, userId }
      });

      if (!basicTicket) {
        throw ApiError.create(404, '找不到對應的票券', ErrorCode.TICKET_NOT_FOUND);
      }

      return basicTicket;
    }

    return ticket;
  }

  /**
   * 驗證核銷權限
   */
  private validateVerificationPermission(order: any, verifierId: string, verifierRole: string): void {
    const organizerUserId = order.ticketType.concertSession.concert.organization.userId;
    const isOrganizer = verifierId === organizerUserId;
    const isAdmin = ['admin', 'superuser'].includes(verifierRole);

    if (!isOrganizer && !isAdmin) {
      throw ApiError.create(
        403, 
        '您沒有權限驗證此票券，只有該演場會的主辦方或管理員可以進行驗票', 
        ErrorCode.AUTH_INSUFFICIENT_PERMISSION
      );
    }
  }

  /**
   * 驗證票券狀態
   */
  private validateTicketStatus(ticket: any): void {
    switch (ticket.status) {
      case 'used':
        throw ApiError.create(400, '票券已被使用', ErrorCode.TICKET_ALREADY_USED);
      case 'refunded':
        throw ApiError.create(400, '票券已退款，無法使用', ErrorCode.TICKET_REFUNDED);
      case 'purchased':
        return; // 正常狀態
      default:
        throw ApiError.create(400, `票券狀態錯誤：${ticket.status}`, ErrorCode.INVALID_TICKET_STATUS);
    }
  }

  /**
   * 驗證核銷時間
   */
  private validateVerificationTime(ticket: any): void {
    const taiwanTimeZone = 'Asia/Taipei';
    const maxAdvanceHours = 2; // 允許提前 2 小時驗票
    
    // 獲取當前 UTC 時間的毫秒數
    const nowUTC = Date.now();
    
    // 將演出開始時間轉換為 UTC 毫秒數
    // 假設 ticket.concertStartTime 是台灣時間字串，需要轉換為 UTC
    const concertStartTime = new Date(ticket.concertStartTime);
    
    // 如果 concertStartTime 是台灣時間，需要減去 8 小時轉換為 UTC
    // 但這裡先假設資料庫儲存的已經是正確的時間
    const concertStartUTC = concertStartTime.getTime();
    
    // 計算最早可驗票時間（UTC 毫秒數）
    const earliestVerifyUTC = concertStartUTC - maxAdvanceHours * 60 * 60 * 1000 - 8 * 60 * 60 * 1000;

    const earliestVerifyTaiwan = new Date(earliestVerifyUTC).toLocaleString('zh-TW', {
      timeZone: taiwanTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    if (nowUTC < earliestVerifyUTC) {
      throw ApiError.create(
        400,
        `演出尚未開始，最早可於 ${earliestVerifyTaiwan} (台北時間) 開始驗票`,
        ErrorCode.TOO_EARLY_TO_VERIFY
      );
    }
  }

  /**
   * 執行核銷操作（使用事務）
   */
  private async executeVerification(ticket: any, verifierId: string, verifierRole: string, verifierEmail: string): Promise<VerificationResult> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 更新票券狀態
      ticket.status = 'used';
      await queryRunner.manager.save(ticket);

      // 可以在這裡添加核銷日誌記錄
      // await this.logVerification(queryRunner, ticket, verifierId);

      await queryRunner.commitTransaction();

      const verifierType = ['admin', 'superuser'].includes(verifierRole) ? '管理員' : '主辦方';
      const verificationTime = new Date();

      // 記錄核銷資訊到 console（驗票稽核軌跡）
      console.info(
        `票券核銷成功 - 票券ID: ${ticket.ticketId}, 驗票人員: ${verifierEmail} (${verifierType}), 時間: ${verificationTime.toISOString()}`
      );

      return {
        ticketId: ticket.ticketId,
        purchaserName: ticket.purchaserName || '無法獲取購買者資訊',
        ticketTypeName: ticket.ticketType?.ticketTypeName || '無法獲取票種資訊',
        concertTitle: ticket.ticketType?.concertSession?.sessionTitle || '無法獲取演場會資訊',
        concertDate: ticket.ticketType?.concertSession?.sessionDate || null,
        verifiedAt: verificationTime,
        verifiedBy: verifierEmail,
        verifierType: verifierType
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
} 