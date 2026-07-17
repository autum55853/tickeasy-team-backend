import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database.js';
import { IsNull } from 'typeorm';
import { Concert } from '../../models/concert.js';
import { handleErrorAsync } from '../../utils/handleErrorAsync.js';
import { ApiError } from '../../utils/index.js';
import { ErrorCode } from '../../types/api.js';

// ------------17. 取得指定演唱會的所有場次及票種-------------
export const getConcertSessions = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { concertId } = req.params;

    // 驗證 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(concertId)) {
      throw ApiError.invalidFormat('演唱會 ID 格式錯誤');
    }

    const concertRepository = AppDataSource.getRepository(Concert);
    const concert = await concertRepository.findOne({
      where: { concertId, cancelledAt: IsNull() },
      relations: ['organization', 'sessions', 'sessions.ticketTypes'], // 確保載入關聯資料
    });

    if (!concert) {
      throw ApiError.notFound('演唱會不存在');
    }

    // 確保 organization 存在，再進行下一步
    if (!concert.organization) {
      // 理論上 concert schema 要求 organizationId，所以應該會有 organization
      // 但以防萬一，如果真的沒有，可以拋出錯誤或回傳特定訊息
      throw ApiError.create(500, '演唱會資料不完整：缺少組織資訊', ErrorCode.DATA_INVALID);
    }

    const result = {
      organization: {
        organizationId: concert.organization.organizationId,
        orgName: concert.organization.orgName,
      },
      concert: {
        concertId: concert.concertId,
        conTitle: concert.conTitle,
        sessions: (concert.sessions || []).map(session => ({
          sessionId: session.sessionId,
          sessionTitle: session.sessionTitle,
          // 日期格式處理為 YYYY-MM-DD
          sessionDate: session.sessionDate instanceof Date
            ? session.sessionDate.toISOString().slice(0, 10)
            : session.sessionDate,
          ticketTypes: (session.ticketTypes || []).map(ticket => ({
            ticketTypeId: ticket.ticketTypeId,
            ticketTypeName: ticket.ticketTypeName,
            ticketTypePrice: ticket.ticketTypePrice,
            remainingQuantity: ticket.remainingQuantity,
            totalQuantity: ticket.totalQuantity,
          })),
        })),
      }
    };

    res.status(200).json({
      status: 'success',
      message: '成功獲取音樂會場次及票種資訊',
      data: result,
    });
  }
);
