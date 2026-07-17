import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database.js';
import { Concert } from '../../models/concert.js';
import { handleErrorAsync } from '../../utils/handleErrorAsync.js';
import { ApiError } from '../../utils/index.js';
import concertReviewService from '../../services/concertReviewService.js';
import { ReviewStatus } from '../../models/concert.js';

// ------------09. 提交演唱會審核-------------
export const submitConcertForReview = handleErrorAsync(
  async (req: Request, res: Response) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser?.userId) {
      throw ApiError.unauthorized();
    }

    const concertId = req.params.concertId;
    const concertRepository = AppDataSource.getRepository(Concert);

    // 查找演唱會
    const concert = await concertRepository.findOne({
      where: { concertId },
      relations: ['sessions', 'sessions.ticketTypes'],
    });

    if (!concert) {
      throw ApiError.notFound('演唱會不存在');
    }

    // 檢查權限：只能操作自己組織的演唱會
    // TODO: 這裡可能需要檢查用戶是否屬於該組織

    // 檢查狀態：草稿或被退回的演唱會可以提交審核
    if (concert.conInfoStatus !== 'draft' && concert.conInfoStatus !== 'rejected') {
      throw ApiError.badRequest(
        `無法提交審核：當前狀態為 ${concert.conInfoStatus}，只有草稿或被退回的演唱會可以提交審核`
      );
    }

    // 驗證演唱會是否完整
    if (
      !concert.organizationId ||
      !concert.venueId ||
      !concert.locationTagId ||
      !concert.musicTagId ||
      !concert.conTitle ||
      !concert.conIntroduction ||
      !concert.conLocation ||
      !concert.conAddress ||
      !concert.eventStartDate ||
      !concert.eventEndDate ||
      !concert.ticketPurchaseMethod ||
      !concert.precautions ||
      !concert.refundPolicy ||
      !concert.imgBanner
    ) {
      throw ApiError.fieldRequired('演唱會資料不完整，請補齊所有必要欄位');
    }

    // 驗證場次
    if (!concert.sessions || concert.sessions.length === 0) {
      throw ApiError.fieldRequired('至少需要一個場次');
    }

    for (const session of concert.sessions) {
      if (
        !session.sessionTitle ||
        !session.sessionDate ||
        !session.sessionStart ||
        !session.sessionEnd ||
        !session.imgSeattable
      ) {
        throw ApiError.invalidFormat('場次資料不完整');
      }

      if (!session.ticketTypes || session.ticketTypes.length === 0) {
        throw ApiError.fieldRequired('每個場次至少需要一種票種');
      }

      for (const ticket of session.ticketTypes) {
        /**------除錯用--------
         *
         * console.log('[Ticket Debug]', {
          ticketTypeName: ticket.ticketTypeName,
          entranceType: ticket.entranceType,
          ticketBenefits: ticket.ticketBenefits,
          ticketRefundPolicy: ticket.ticketRefundPolicy,
          ticketTypePrice: ticket.ticketTypePrice,
          typeofPrice: typeof ticket.ticketTypePrice,
          totalQuantity: ticket.totalQuantity,
          sellBeginDate: ticket.sellBeginDate,
          sellEndDate: ticket.sellEndDate,
        });
         */

        // 強制轉型
        ticket.ticketTypePrice = Number(ticket.ticketTypePrice);
        ticket.totalQuantity = Number(ticket.totalQuantity);

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
          throw ApiError.invalidFormat('票種資料不完整');
        }

        const sellStart = new Date(ticket.sellBeginDate);
        const sellEnd = new Date(ticket.sellEndDate);
        if (sellStart >= sellEnd) {
          throw ApiError.invalidFormat('售票結束時間必須晚於售票開始時間');
        }
      }
    }

    // 更新狀態為審核中
    concert.conInfoStatus = 'reviewing';
    await concertRepository.save(concert);

    // 非同步觸發 AI 審核，不影響主流程
    concertReviewService.triggerAIReview(concert.concertId)
      .then((aiReview) => {
        console.log(`[AI審核] 演唱會 ${concert.concertId} AI審核已完成，狀態：${aiReview.reviewStatus}`);
      })
      .catch((err) => {
        console.error(`[AI審核] 演唱會 ${concert.concertId} AI審核失敗：`, err);
      });
    //

    res.status(200).json({
      status: 'success',
      message: '演唱會已提交審核，請等待管理員審核',
      data: {
        concertId: concert.concertId,
        conInfoStatus: concert.conInfoStatus,
        submittedAt: new Date().toISOString(),
      },
    });
  }
);

// ------------16. 獲取演唱會審核記錄-------------
export const getConcertReviews = handleErrorAsync(
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
      where: { concertId },
      select: ['concertId', 'conInfoStatus'], // 只需要 concertId 和 conInfoStatus
    });

    if (!concert) {
      throw ApiError.notFound('演唱會不存在');
    }

    if (concert.conInfoStatus === 'draft') {
      return res.status(200).json({
        status: 'success',
        message: '演唱會為草稿狀態，尚無審核記錄。',
        data: {
          concertId: concert.concertId,
          conInfoStatus: concert.conInfoStatus,
          reviews: [],
        },
      });
    }

    // 如果不是草稿，則從服務獲取審核記錄
    const reviewsArray = await concertReviewService.getConcertReviews(concertId);

    res.status(200).json({
      status: 'success',
      message: '成功取得演唱會審核記錄',
      data: {
        concertId: concert.concertId,
        conInfoStatus: concert.conInfoStatus,
        reviews: reviewsArray, // reviewsArray 是從服務取得的審核記錄陣列
      },
    });
  }
);

// ------------18. 手動審核演唱會-------------
export const submitManualConcertReview = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { concertId } = req.params;
    const {
      reviewStatus,
      reviewerNote,
    }: {
      reviewStatus: ReviewStatus.APPROVED | ReviewStatus.REJECTED;
      reviewerNote: string;
    } = req.body;

    // 1. 驗證使用者身份與權限
    const authenticatedUser = req.user as { userId: string; role: string };
    if (!authenticatedUser?.userId) {
      throw ApiError.unauthorized();
    }
    // TODO: 在未來更精確的角色管理中，這裡應檢查 user.role === 'admin'
    const reviewerId = authenticatedUser.userId;

    // 2. 驗證輸入參數
    if (
      !reviewStatus ||
      (reviewStatus !== ReviewStatus.APPROVED &&
        reviewStatus !== ReviewStatus.REJECTED)
    ) {
      throw ApiError.badRequest(
        '審核狀態 (reviewStatus) 為必填，且必須是 "approved" 或 "rejected"'
      );
    }
    if (typeof reviewerNote !== 'string' || reviewerNote.trim() === '') {
      throw ApiError.badRequest('審核意見 (reviewerNote) 為必填且不可為空');
    }

    // 3. 呼叫服務層進行審核
    const newReview = await concertReviewService.submitManualReview(
      concertId,
      reviewerId,
      reviewStatus,
      reviewerNote
    );

    // 4. 回傳成功回應
    res.status(201).json({
      status: 'success',
      message: `演唱會已手動審核完畢，狀態為: ${reviewStatus}`,
      data: newReview,
    });
  }
);
