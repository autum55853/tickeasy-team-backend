import { Request, Response } from 'express';
import { AppDataSource } from '../config/database.js';
import { ApiError, handleErrorAsync } from '../utils/index.js';
import { ApiResponse } from '../types/api.js';
import { Ticket as TicketEntity } from '../models/ticket.js';
import { ConcertSession as ConcertSessionEntity } from '../models/concert-session.js';

/**
 * GET /api/v1/sessions/:sessionId/check-inused
 * 取得指定場次的票券報到狀態清單（支援分頁、搜尋、狀態篩選）。
 * 僅允許該場次主辦方或系統管理員(admin/superuser)查詢。
 */
export const getCheckInUsedRecords = handleErrorAsync(
  async (req: Request, res: Response<ApiResponse>) => {
    const authUser = req.user as {
      userId: string;
      role: string;
      email: string;
    };

    const { sessionId } = req.params;
    const {
      status = 'all',
      search = '',
      page = '1',
      perPage = '10',
      sortedBy = 'newToOld',
    } = req.query as Record<string, string>;

    // ---------- 基本驗證 ----------
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      throw ApiError.invalidFormat('sessionId');
    }

    // 解析分頁參數
    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
    const perPageNum = Math.min(
      Math.max(parseInt(String(perPage), 10) || 10, 1),
      100
    );

    // ---------- 權限檢查 ----------
    const sessionRepo = AppDataSource.getRepository(ConcertSessionEntity);
    const session = await sessionRepo.findOne({
      where: { sessionId },
      relations: ['concert', 'concert.organization'],
    });

    if (!session) {
      throw ApiError.notFound('音樂會場次');
    }

    const organizerId = session.concert?.organization?.userId;
    const isOrganizer = organizerId === authUser.userId;
    const isAdmin = ['admin', 'superuser'].includes(String(authUser.role));

    if (!isOrganizer && !isAdmin) {
      throw ApiError.forbidden();
    }

    // ---------- 查詢票券 ----------
    const ticketRepo = AppDataSource.getRepository(TicketEntity);
    const qb = ticketRepo
      .createQueryBuilder('ticket')
      .leftJoin('ticket.ticketType', 'ticketType')
      .leftJoin('ticket.order', 'order')
      .where('ticketType.concertSessionId = :sessionId', { sessionId });

    // 狀態篩選
    if (status !== 'all') {
      if (!['purchased', 'refunded', 'used'].includes(status)) {
        throw ApiError.invalidFormat('status');
      }
      qb.andWhere('ticket.status = :status', { status });
    }

    // 搜尋 (orderNumber、purchaserName、purchaserEmail)
    if (search) {
      qb.andWhere(
        '(order.orderNumber ILIKE :kw OR ticket.purchaserName ILIKE :kw OR ticket.purchaserEmail ILIKE :kw)',
        { kw: `%${search}%` }
      );
    }

    // 取得總筆數 (需在 skip/take 之前)
    const totalCount = await qb.getCount();

    // 排序、分頁
    qb.orderBy('ticket.purchaseTime',
      sortedBy === 'oldToNew' ? 'ASC' : 'DESC')
      .skip((pageNum - 1) * perPageNum)
      .take(perPageNum)
      .select([
        'ticket.ticketId',
        'ticket.orderId',
        'ticket.purchaserName',
        'ticket.purchaseTime',
        'ticket.status',
        'ticketType.ticketTypeName',
      ]);

    const tickets = await qb.getMany();

    // 整理回傳資料
    const checkInRecords = tickets.map((t) => ({
      ticketId: t.ticketId,
      orderId: t.orderId,
      purchaserName: t.purchaserName,
      ticketTypeName: t.ticketType?.ticketTypeName ?? null,
      purchaseTime: t.purchaseTime,
      status: t.status,
    }));

    const pages = Math.ceil(totalCount / perPageNum);

    return res.status(200).json({
      status: 'success',
      message: '成功獲取報到狀況',
      data: {
        checkInRecords,
        pagination: {
          count: totalCount,
          pages,
          currentPage: pageNum,
          perPage: perPageNum,
        },
      },
    });
  }
); 