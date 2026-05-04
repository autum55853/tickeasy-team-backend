/**
 * 票券控制器 - 重構版本
 * 乾淨簡潔，使用服務層處理業務邏輯
 */
import { Request, Response } from 'express';
import { AppDataSource } from '../config/database.js';
import { TicketType as TicketTypeEntity } from '../models/ticket-type.js';
import { handleErrorAsync, ApiError } from '../utils/index.js';
import { ApiResponse } from '../types/api.js';
import { TicketVerificationService } from '../services/ticketVerificationService.js';
// import { Index } from 'typeorm';


/**
 * 獲取用戶個人資料
 */
// function getConcertTickets(url: string): string | null {
//   try {
//     const urlParts = url.split('/ticket/');
//     if (urlParts.length === 2) {
//       return urlParts[1];
//     }
//   } catch (e) { console.log(e); /* 忽略解析錯誤 */ }
//   return null;
// }


export const getConcertTickets = handleErrorAsync(async (req: Request, res: Response<ApiResponse>) => {
  const concertSessionId = req.params.concertSessionId;
  
  if (!concertSessionId) {
    throw ApiError.fieldRequired('concertSessionId');
  }

  const ticketTypeRepository = AppDataSource.getRepository(TicketTypeEntity);
  const tickets = await ticketTypeRepository.find({
    where: { concertSessionId },
    select: [
      'ticketTypeId', 
      'ticketTypeName', 
      'entranceType', 
      'ticketBenefits', 
      'ticketRefundPolicy', 
      'ticketTypePrice', 
      'totalQuantity', 
      'remainingQuantity', 
      'sellBeginDate', 
      'sellEndDate'
    ]
  });

  return res.status(200).json({
    status: 'success',
    message: '獲取演唱會票券成功',
    data: { tickets }
  });
});

/**
 * 驗票 API - 透過 QR Code 字串核銷票券
 * 權限：只有該票券的主辦方或管理員可以核銷
 */
export const verifyTicket = handleErrorAsync(async (req: Request, res: Response<ApiResponse>) => {
  const { qrCode } = req.body;
  const authenticatedUser = req.user as { userId: string; role: string; email: string; };

  // 基本驗證
  if (!qrCode || typeof qrCode !== 'string') {
    throw ApiError.fieldRequired('qrCode');
  }

  // 使用服務進行核銷
  const verificationService = new TicketVerificationService();
  const result = await verificationService.verifyTicket(
    qrCode, 
    authenticatedUser.userId, 
    authenticatedUser.role,
    authenticatedUser.email
  );

  return res.status(200).json({
    status: 'success',
    message: '票券驗證成功',
    data: result
  });
});
