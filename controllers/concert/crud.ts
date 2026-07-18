import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database.js';
import { IsNull } from 'typeorm';
import { Concert } from '../../models/concert.js';
import { TicketType } from '../../models/ticket-type.js';
import { handleErrorAsync } from '../../utils/handleErrorAsync.js';
import { ApiError } from '../../utils/index.js';
import {
  CreateConcertRequest,
  ConcertResponse,
  ConcertSessionResponse,
} from '../../types/concert/index.js';
import { ErrorCode } from '../../types/api.js';
import { ConcertSession } from '../../models/concert-session.js';
import concertImageService from '../../services/concertImageService.js';

// ------------1. 建立活動-------------
export const createConcert = handleErrorAsync(
  async (req: Request, res: Response<ConcertResponse>) => {
    // 驗證
    const authenticatedUser = req.user as { userId: string }; // 來自 isAuthenticated
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw ApiError.unauthorized();
    }

    const {
      organizationId,
      venueId,
      locationTagId,
      musicTagId,
      conTitle,
      conIntroduction,
      conLocation,
      conAddress,
      eventStartDate,
      eventEndDate,
      ticketPurchaseMethod,
      precautions,
      refundPolicy,
      conInfoStatus,
      imgBanner,
      sessions,
    } = req.body as CreateConcertRequest;

    // 是否為草稿狀態
    const isDraft = conInfoStatus === 'draft';
    // 草稿後端不驗證

    // --- 基本驗證 ---
    // 驗證活動
    if (!isDraft) {
      if (
        !organizationId ||
        !venueId ||
        !locationTagId ||
        !musicTagId ||
        !conTitle ||
        !conIntroduction ||
        !conLocation ||
        !conAddress ||
        !eventStartDate ||
        !eventEndDate ||
        !ticketPurchaseMethod ||
        !precautions ||
        !refundPolicy ||
        !conInfoStatus
      ) {
        throw ApiError.fieldRequired('所有欄位');
      }

      if (!imgBanner) {
        throw ApiError.fieldRequired('主視覺與座位圖');
      }

      const startDate = new Date(eventStartDate);
      const endDate = new Date(eventEndDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw ApiError.invalidFormat('活動開始與結束日期');
      }
      if (startDate >= endDate) {
        throw ApiError.invalidFormat('活動結束時間必須晚於開始時間，');
      }
    }

    // 驗證 session
    if (!isDraft) {
      if (!Array.isArray(sessions) || sessions.length === 0) {
        throw ApiError.fieldRequired('至少需要一場場次');
      }

      for (const session of sessions) {
        if (
          !session.sessionTitle ||
          !session.sessionDate ||
          !session.sessionStart ||
          !session.sessionEnd ||
          !session.imgSeattable ||
          !Array.isArray(session.ticketTypes)
        ) {
          throw ApiError.invalidFormat('場次資料格式錯誤');
        }

        for (const ticket of session.ticketTypes) {
          if (
            !ticket.ticketTypeName ||
            !ticket.entranceType ||
            !ticket.ticketBenefits ||
            !ticket.ticketRefundPolicy ||
            typeof ticket.ticketTypePrice !== 'number' ||
            ticket.ticketTypePrice < 0 ||
            typeof ticket.totalQuantity !== 'number' ||
            ticket.totalQuantity <= 0 ||
            !ticket.sellBeginDate ||
            !ticket.sellEndDate
          ) {
            throw ApiError.invalidFormat('票種資料格式錯誤');
          }

          const sellStart = new Date(ticket.sellBeginDate);
          const sellEnd = new Date(ticket.sellEndDate);
          if (sellStart >= sellEnd) {
            throw ApiError.invalidFormat('售票結束時間必須晚於售票開始時間');
          }
        }
      }
    }

    // --- 驗證結束 ---

    const concertRepository = AppDataSource.getRepository(Concert);
    const sessionRepository = AppDataSource.getRepository(ConcertSession);
    const ticketTypeRepository = AppDataSource.getRepository(TicketType);

    // 檢查名稱是否重複
    const existingConcert = await concertRepository.findOne({
      where: { conTitle: conTitle, cancelledAt: IsNull() },
    });
    if (existingConcert) {
      throw ApiError.create(
        409,
        '此活動名稱已被使用',
        ErrorCode.DATA_ALREADY_EXISTS
      );
    }

    // 建立concert
    const concertData: Partial<Concert> = {
      organizationId,
      venueId,
      locationTagId,
      musicTagId,
      conTitle: conTitle,
      conIntroduction: conIntroduction ?? '',
      conLocation: conLocation ?? '',
      conAddress: conAddress ?? '',
      eventStartDate: eventStartDate ? new Date(eventStartDate) : undefined,
      eventEndDate: eventEndDate ? new Date(eventEndDate) : undefined,
      imgBanner,
      ticketPurchaseMethod,
      precautions,
      refundPolicy,
      conInfoStatus: 'draft', // 強制設為草稿狀態
    };
    const newConcert = concertRepository.create(concertData);
    const savedConcert = await concertRepository.save(newConcert);

    // 處理音樂會橫幅圖片
    if (imgBanner) {
      savedConcert.imgBanner = await concertImageService.processConcertBanner(
        imgBanner,
        savedConcert.concertId,
        savedConcert.conTitle
      );
      await concertRepository.save(savedConcert);
    }

    // 建立 sessions 跟 ticketTypes
    const savedSessions: ConcertSessionResponse[] = [];
    for (const session of sessions) {
      const sessionEntity = sessionRepository.create({
        concert: savedConcert,
        sessionTitle: session.sessionTitle,
        sessionDate: new Date(session.sessionDate),
        sessionStart: session.sessionStart,
        sessionEnd: session.sessionEnd,
        imgSeattable: session.imgSeattable,
      });
      const savedSession = await sessionRepository.save(sessionEntity);

      // 處理座位表圖片
      if (session.imgSeattable) {
        try {
          savedSession.imgSeattable =
            await concertImageService.processConcertSeatingTable(
              session.imgSeattable,
              savedSession.sessionId,
              savedSession.sessionTitle
            );
          await sessionRepository.save(savedSession);
        } catch (error) {
          // 如果圖片處理失敗，刪除已建立的 concert 和相關 session 記錄
          await concertRepository.remove(savedConcert);
          throw error; // 重新拋出錯誤
        }
      }

      const ticketEntities = session.ticketTypes.map((ticket) =>
        ticketTypeRepository.create({
          concertSession: savedSession,
          ticketTypeName: ticket.ticketTypeName,
          entranceType: ticket.entranceType,
          ticketBenefits: ticket.ticketBenefits,
          ticketRefundPolicy: ticket.ticketRefundPolicy,
          ticketTypePrice: ticket.ticketTypePrice,
          totalQuantity: ticket.totalQuantity,
          remainingQuantity: ticket.totalQuantity,
          sellBeginDate: new Date(ticket.sellBeginDate),
          sellEndDate: new Date(ticket.sellEndDate),
        })
      );
      const savedTickets = await ticketTypeRepository.save(ticketEntities);
      savedSessions.push({
        sessionId: savedSession.sessionId,
        sessionTitle: savedSession.sessionTitle,
        sessionDate: new Date(savedSession.sessionDate).toISOString(),
        sessionStart: savedSession.sessionStart,
        sessionEnd: savedSession.sessionEnd,
        imgSeattable: savedSession.imgSeattable,
        ticketTypes: savedTickets.map((ticket) => ({
          ticketTypeId: ticket.ticketTypeId,
          ticketTypeName: ticket.ticketTypeName,
          entranceType: ticket.entranceType,
          ticketBenefits: ticket.ticketBenefits,
          ticketRefundPolicy: ticket.ticketRefundPolicy,
          ticketTypePrice: ticket.ticketTypePrice,
          totalQuantity: ticket.totalQuantity,
          remainingQuantity: ticket.remainingQuantity,
          sellBeginDate: ticket.sellBeginDate.toISOString(),
          sellEndDate: ticket.sellEndDate.toISOString(),
        })),
      });
    }

    // 成功！
    res.status(201).json({
      status: 'success',
      message: '演唱會活動建立成功！',
      data: {
        concert: {
          concertId: savedConcert.concertId,
          organizationId: savedConcert.organizationId,
          venueId: savedConcert.venueId,
          locationTagId: savedConcert.locationTagId,
          musicTagId: savedConcert.musicTagId,
          conTitle: savedConcert.conTitle,
          conIntroduction: savedConcert.conIntroduction,
          conLocation: savedConcert.conLocation,
          conAddress: savedConcert.conAddress,
          eventStartDate:
            savedConcert.eventStartDate?.toISOString() ?? undefined,
          eventEndDate: savedConcert.eventEndDate?.toISOString() ?? undefined,
          imgBanner: savedConcert.imgBanner,
          ticketPurchaseMethod: savedConcert.ticketPurchaseMethod,
          precautions: savedConcert.precautions,
          refundPolicy: savedConcert.refundPolicy,
          conInfoStatus: savedConcert.conInfoStatus,
          reviewStatus: savedConcert.reviewStatus,
          visitCount: savedConcert.visitCount,
          promotion: savedConcert.promotion ?? 0,
          cancelledAt: savedConcert.cancelledAt?.toISOString() ?? undefined,
          createdAt: savedConcert.createdAt.toISOString(),
          updatedAt: savedConcert.updatedAt.toISOString(),
          sessions: savedSessions,
        },
      },
    });
  }
);

// ------------2. 修改活動-------------
export const updateConcert = handleErrorAsync(
  async (req: Request, res: Response<ConcertResponse>) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser?.userId) {
      throw ApiError.unauthorized();
    }

    const concertId = req.params.concertId;

    const {
      organizationId,
      venueId,
      locationTagId,
      musicTagId,
      conTitle,
      conIntroduction,
      conLocation,
      conAddress,
      eventStartDate,
      eventEndDate,
      ticketPurchaseMethod,
      precautions,
      refundPolicy,
      conInfoStatus,
      imgBanner,
      sessions,
    } = req.body as CreateConcertRequest;

    const concertRepository = AppDataSource.getRepository(Concert);
    const sessionRepository = AppDataSource.getRepository(ConcertSession);
    const ticketTypeRepository = AppDataSource.getRepository(TicketType);

    // const concert = await concertRepository.findOneBy({ concertId });
    const concert = await concertRepository.findOne({
      where: { concertId, cancelledAt: IsNull() },
    });

    if (!concert) {
      throw ApiError.notFound('演唱會不存在');
    }

    if (
      concert.conInfoStatus !== 'draft' &&
      concert.conInfoStatus !== 'rejected'
    ) {
      throw ApiError.badRequest('僅能編輯草稿或被退回的演唱會');
    }

    const isDraft = conInfoStatus === 'draft';

    // ---------- 驗證主資料 ----------
    if (!isDraft) {
      if (
        !organizationId ||
        !venueId ||
        !locationTagId ||
        !musicTagId ||
        !conTitle ||
        !conIntroduction ||
        !conLocation ||
        !conAddress ||
        !eventStartDate ||
        !eventEndDate ||
        !ticketPurchaseMethod ||
        !precautions ||
        !refundPolicy ||
        !conInfoStatus
      ) {
        throw ApiError.fieldRequired('所有欄位');
      }

      if (!imgBanner) {
        throw ApiError.fieldRequired('主視覺');
      }

      const startDate = new Date(eventStartDate);
      const endDate = new Date(eventEndDate);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw ApiError.invalidFormat('活動日期格式錯誤');
      }
      if (startDate >= endDate) {
        throw ApiError.invalidFormat('結束時間需晚於開始時間');
      }
    }

    // ---------- 處理音樂會橫幅圖片更新 ----------
    const newBannerUrl = await concertImageService.updateConcertBanner(
      imgBanner,
      concert.imgBanner,
      concertId
    );

    // ---------- 更新主資料 ----------
    concert.organizationId = organizationId;
    concert.venueId = venueId;
    concert.locationTagId = locationTagId;
    concert.musicTagId = musicTagId;
    concert.conTitle = conTitle;
    concert.conIntroduction = conIntroduction ?? '';
    concert.conLocation = conLocation ?? '';
    concert.conAddress = conAddress ?? '';
    concert.eventStartDate = eventStartDate ? new Date(eventStartDate) : null;
    concert.eventEndDate = eventEndDate ? new Date(eventEndDate) : null;
    concert.ticketPurchaseMethod = ticketPurchaseMethod;
    concert.precautions = precautions;
    concert.refundPolicy = refundPolicy;
    // conInfoStatus 不允許前端修改，保持原本狀態，只能透過專門的端點改變
    concert.imgBanner = newBannerUrl;

    await concertRepository.save(concert);

    // ---------- 刪除並重建 sessions ----------
    await sessionRepository.delete({ concert: { concertId } });

    const savedSessions: ConcertSessionResponse[] = [];
    for (const session of sessions) {
      if (!isDraft) {
        if (
          !session.sessionTitle ||
          !session.sessionDate ||
          !session.sessionStart ||
          !session.sessionEnd ||
          !session.imgSeattable ||
          !Array.isArray(session.ticketTypes)
        ) {
          throw ApiError.invalidFormat('場次格式錯誤');
        }
      }

      const sessionEntity = sessionRepository.create({
        concert,
        sessionTitle: session.sessionTitle,
        sessionDate: new Date(session.sessionDate),
        sessionStart: session.sessionStart,
        sessionEnd: session.sessionEnd,
        imgSeattable: session.imgSeattable,
      });
      const savedSession = await sessionRepository.save(sessionEntity);

      // ---------- 處理座位表圖片 ----------
      if (session.imgSeattable) {
        savedSession.imgSeattable =
          await concertImageService.processConcertSeatingTable(
            session.imgSeattable,
            savedSession.sessionId,
            savedSession.sessionTitle
          );
        await sessionRepository.save(savedSession);
      }

      const ticketEntities =
        session.ticketTypes?.map((ticket) => {
          if (!isDraft) {
            if (
              !ticket.ticketTypeName ||
              !ticket.entranceType ||
              !ticket.ticketBenefits ||
              !ticket.ticketRefundPolicy ||
              typeof ticket.ticketTypePrice !== 'number' ||
              ticket.ticketTypePrice < 0 ||
              typeof ticket.totalQuantity !== 'number' ||
              ticket.totalQuantity <= 0 ||
              !ticket.sellBeginDate ||
              !ticket.sellEndDate
            ) {
              throw ApiError.invalidFormat('票種格式錯誤');
            }

            const sellStart = new Date(ticket.sellBeginDate);
            const sellEnd = new Date(ticket.sellEndDate);
            if (sellStart >= sellEnd) {
              throw ApiError.invalidFormat('售票結束時間必須晚於售票開始時間');
            }
          }

          return ticketTypeRepository.create({
            concertSession: savedSession,
            ticketTypeName: ticket.ticketTypeName,
            entranceType: ticket.entranceType,
            ticketBenefits: ticket.ticketBenefits,
            ticketRefundPolicy: ticket.ticketRefundPolicy,
            ticketTypePrice: ticket.ticketTypePrice,
            totalQuantity: ticket.totalQuantity,
            remainingQuantity: ticket.totalQuantity,
            sellBeginDate: new Date(ticket.sellBeginDate),
            sellEndDate: new Date(ticket.sellEndDate),
          });
        }) ?? [];

      const savedTickets = await ticketTypeRepository.save(ticketEntities);

      savedSessions.push({
        sessionId: savedSession.sessionId,
        sessionTitle: savedSession.sessionTitle,
        sessionDate: savedSession.sessionDate.toISOString(),
        sessionStart: savedSession.sessionStart,
        sessionEnd: savedSession.sessionEnd,
        imgSeattable: savedSession.imgSeattable,
        ticketTypes: savedTickets.map((ticket) => ({
          ticketTypeId: ticket.ticketTypeId,
          ticketTypeName: ticket.ticketTypeName,
          entranceType: ticket.entranceType,
          ticketBenefits: ticket.ticketBenefits,
          ticketRefundPolicy: ticket.ticketRefundPolicy,
          ticketTypePrice: ticket.ticketTypePrice,
          totalQuantity: ticket.totalQuantity,
          remainingQuantity: ticket.remainingQuantity,
          sellBeginDate: ticket.sellBeginDate.toISOString(),
          sellEndDate: ticket.sellEndDate.toISOString(),
        })),
      });
    }

    res.status(200).json({
      status: 'success',
      message: '演唱會內容更新成功',
      data: {
        concert: {
          concertId: concert.concertId,
          organizationId: concert.organizationId,
          venueId: concert.venueId,
          locationTagId: concert.locationTagId,
          musicTagId: concert.musicTagId,
          conTitle: concert.conTitle,
          conIntroduction: concert.conIntroduction,
          conLocation: concert.conLocation,
          conAddress: concert.conAddress,
          eventStartDate: concert.eventStartDate?.toISOString() ?? undefined,
          eventEndDate: concert.eventEndDate?.toISOString() ?? undefined,
          imgBanner: concert.imgBanner,
          ticketPurchaseMethod: concert.ticketPurchaseMethod,
          precautions: concert.precautions,
          refundPolicy: concert.refundPolicy,
          conInfoStatus: concert.conInfoStatus,
          reviewStatus: concert.reviewStatus,
          visitCount: concert.visitCount,
          promotion: concert.promotion ?? 0,
          cancelledAt: concert.cancelledAt?.toISOString() ?? undefined,
          createdAt: concert.createdAt.toISOString(),
          updatedAt: concert.updatedAt.toISOString(),
          sessions: savedSessions,
        },
      },
    });
  }
);

// ------------10. 獲得演唱會詳細資料-------------
export const getConcertById = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { concertId } = req.params;

    // 驗證 concertId的UUID 格式
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(concertId)) {
      throw ApiError.invalidFormat('演唱會 ID 格式錯誤');
    }

    const concertRepository = AppDataSource.getRepository(Concert);
    const concert = await concertRepository.findOne({
      where: {
        concertId: concertId,
        cancelledAt: IsNull(),
      },
      relations: ['sessions', 'sessions.ticketTypes','venue'],
    });
    if (!concert) {
      throw ApiError.notFound('演唱會不存在');
    }

    res.status(200).json({
      status: 'success',
      data: concert,
    });
  }
);

// ------------13. 軟刪除演唱會-------------
export const softDeleteConcert = handleErrorAsync(
  async (req: Request, res: Response) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser?.userId) {
      throw ApiError.unauthorized();
    }

    const concertId = req.params.concertId;
    const concertRepository = AppDataSource.getRepository(Concert);

    const concert = await concertRepository.findOne({
      where: { concertId, cancelledAt: IsNull() },
      relations: ['organization'],
    });

    if (!concert) {
      throw ApiError.notFound('演唱會不存在');
    }

    // 檢查是否可以刪除
    if (!concert.canBeDeleted()) {
      throw ApiError.badRequest('只能刪除草稿、退回或審核中的演唱會');
    }

    // 軟刪除
    concert.softDelete();
    await concertRepository.save(concert);

    res.status(200).json({
      status: 'success',
      message: '演唱會已成功軟刪除',
      data: {
        concertId: concert.concertId,
        cancelledAt: concert.cancelledAt,
      },
    });
  }
);

// ------------14. 複製演唱會 -------------
export const duplicateConcert = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { concertId } = req.params;
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser?.userId) throw ApiError.unauthorized();

    const concertRepo = AppDataSource.getRepository(Concert);
    const sessionRepo = AppDataSource.getRepository(ConcertSession);
    const ticketTypeRepo = AppDataSource.getRepository(TicketType);

    const originalConcert = await concertRepo.findOne({
      where: { concertId, cancelledAt: IsNull() },
      relations: ['sessions', 'sessions.ticketTypes'],
    });
    if (!originalConcert) throw ApiError.notFound('演唱會不存在');

    // 複製 concert 主資料
    const concertData: Partial<Concert> = {
      organizationId: originalConcert.organizationId,
      venueId: originalConcert.venueId,
      locationTagId: originalConcert.locationTagId,
      musicTagId: originalConcert.musicTagId,
      conTitle: `${originalConcert.conTitle} (複製)`,
      conIntroduction: originalConcert.conIntroduction,
      conLocation: originalConcert.conLocation,
      conAddress: originalConcert.conAddress,
      eventStartDate: originalConcert.eventStartDate,
      eventEndDate: originalConcert.eventEndDate,
      imgBanner: originalConcert.imgBanner,
      ticketPurchaseMethod: originalConcert.ticketPurchaseMethod,
      precautions: originalConcert.precautions,
      refundPolicy: originalConcert.refundPolicy,
      conInfoStatus: 'draft',
      visitCount: 0,
      promotion: 0,
      cancelledAt: null,
    };

    const duplicatedConcert = concertRepo.create(concertData);
    const savedConcert: Concert = await concertRepo.save(duplicatedConcert);

    // 複製 sessions 和 ticketTypes
    for (const originalSession of originalConcert.sessions) {
      const duplicatedSession = sessionRepo.create({
        concert: savedConcert,
        sessionTitle: originalSession.sessionTitle,
        sessionDate: originalSession.sessionDate,
        sessionStart: originalSession.sessionStart,
        sessionEnd: originalSession.sessionEnd,
        imgSeattable: originalSession.imgSeattable,
      });
      const savedSession = await sessionRepo.save(duplicatedSession);

      const duplicatedTickets = originalSession.ticketTypes.map((ticket) =>
        ticketTypeRepo.create({
          concertSession: savedSession,
          ticketTypeName: ticket.ticketTypeName,
          entranceType: ticket.entranceType,
          ticketBenefits: ticket.ticketBenefits,
          ticketRefundPolicy: ticket.ticketRefundPolicy,
          ticketTypePrice: ticket.ticketTypePrice,
          totalQuantity: ticket.totalQuantity,
          remainingQuantity: ticket.totalQuantity,
          sellBeginDate: ticket.sellBeginDate,
          sellEndDate: ticket.sellEndDate,
        })
      );

      await ticketTypeRepo.save(duplicatedTickets);
    }

    res.status(201).json({
      status: 'success',
      message: '演唱會複製成功，已儲存為草稿',
      data: {
        concertId: savedConcert.concertId,
        conTitle: savedConcert.conTitle,
        conInfoStatus: savedConcert.conInfoStatus,
      },
    });
  }
);

// ------------15. 檢查演唱會名字是否重複-------------
export const checkConcertTitleExists = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { conTitle } = req.query as { conTitle: string };

    if (!conTitle) {
      throw ApiError.fieldRequired('演唱會名稱');
    }

    const concertRepository = AppDataSource.getRepository(Concert);
    const existingConcert = await concertRepository.findOne({
      where: { conTitle: conTitle, cancelledAt: IsNull() },
    });

    res.status(200).json({
      status: 'success',
      message: existingConcert ? '演唱會名稱已存在' : '演唱會名稱可用',
      data: { exists: !!existingConcert },
    });
  }
);
