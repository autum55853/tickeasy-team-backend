import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database.js';
import { IsNull } from 'typeorm';
import { Concert } from '../../models/concert.js';
import { handleErrorAsync } from '../../utils/handleErrorAsync.js';
import { ApiError } from '../../utils/index.js';

// ------------4. 取得熱門活動-------------
// 取得熱門活動, 首頁
// 先依據promotion權重降序，若promotion相同，再依visitCount排序
export const getPopularConcerts = handleErrorAsync(
  async (req: Request, res: Response) => {
    const concertRepository = AppDataSource.getRepository(Concert);
    const take = Number(req.query.take) || 3;

    const popularConcerts = await concertRepository.find({
      where: {
        conInfoStatus: 'published', // 僅顯示已發佈活動
        cancelledAt: IsNull(), // 不顯示已取消的活動
      },
      order: {
        promotion: 'ASC',
        visitCount: 'ASC',
      },
      take,
      select: [
        'concertId',
        'conTitle',
        'conIntroduction',
        'imgBanner',
        'promotion',
        'visitCount',
      ],
    });

    res.status(200).json({
      message: '取得資料成功',
      status: 'success',
      data: popularConcerts,
    });
  }
);

//------------5. 增加visitCount-------------
export const incrementVisitCount = handleErrorAsync(
  async (req: Request, res: Response) => {
    const concertId = req.params.concertId;
    const concertRepo = AppDataSource.getRepository(Concert);

    const concert = await concertRepo.findOne({
      where: { concertId, cancelledAt: IsNull() },
    });
    if (!concert) throw ApiError.notFound('演唱會不存在');

    concert.visitCount += 1;
    await concertRepo.save(concert);

    res.status(200).json({
      status: 'success',
      message: '參觀人數已增加',
      data: { visitCount: concert.visitCount },
    });
  }
);

//------------6. 設定promotion權重-------------
export const updatePromotion = handleErrorAsync(
  async (req: Request, res: Response) => {
    const concertId = req.params.concertId;
    const { promotion } = req.body as { promotion: number };

    if (typeof promotion !== 'number' || promotion < 0) {
      throw ApiError.invalidFormat('promotion 欄位必須為非負整數');
    }

    const concertRepo = AppDataSource.getRepository(Concert);
    const concert = await concertRepo.findOne({
      where: { concertId, cancelledAt: IsNull() },
    });

    if (!concert) throw ApiError.notFound('演唱會不存在');

    concert.promotion = promotion;
    await concertRepo.save(concert);

    res.status(200).json({
      status: 'success',
      message: 'promotion 權重更新成功',
      data: { concertId, promotion },
    });
  }
);

//------------7. 搜尋活動----------------
export const searchConcerts = handleErrorAsync(
  async (req: Request, res: Response) => {
    const concertRepository = AppDataSource.getRepository(Concert);
    const {
      keyword = '',
      locationTagId,
      musicTagId,
      startDate,
      endDate,
      page = 1,
      perPage = 10,
      sortedBy = 'newToOld',
    } = req.query as Record<string, string>;

    const take = parseInt(perPage.toString(), 10);
    const skip = (parseInt(page.toString(), 10) - 1) * take;

    const query = concertRepository
      .createQueryBuilder('concert')
      .leftJoinAndSelect('concert.venue', 'venue')
      .leftJoinAndSelect('concert.locationTag', 'locationTag')
      .leftJoinAndSelect('concert.musicTag', 'musicTag')
      .where(
        'concert.conInfoStatus = :status AND concert.cancelledAt IS NULL',
        { status: 'published' }
      );

    if (keyword) {
      query.andWhere(
        '(concert.conTitle ILIKE :keyword OR concert.conIntroduction ILIKE :keyword)',
        { keyword: `%${keyword}%` }
      );
    }

    if (locationTagId) {
      query.andWhere('concert.locationTagId = :locationTagId', {
        locationTagId,
      });
    }

    if (musicTagId) {
      query.andWhere('concert.musicTagId = :musicTagId', { musicTagId });
    }

    if (startDate) {
      query.andWhere('concert.eventStartDate >= :startDate', {
        startDate,
      });
    }

    if (endDate) {
      query.andWhere('concert.eventEndDate <= :endDate', { endDate });
    }

    if (sortedBy === 'newToOld') {
      query.orderBy('concert.eventStartDate', 'DESC');
    } else if (sortedBy === 'oldToNew') {
      query.orderBy('concert.eventStartDate', 'ASC');
    }

    const [concerts, count] = await query
      .skip(skip)
      .take(take)
      .getManyAndCount();
    const result = concerts.map((concert) => ({
      concertId: concert.concertId,
      conTitle: concert.conTitle,
      conIntroduction: concert.conIntroduction,
      conAddress: concert.conAddress,
      eventStartDate: concert.eventStartDate,
      conLocation: concert.conLocation,
      eventEndDate: concert.eventEndDate,
      imgBanner: concert.imgBanner,
      venueName: (concert as any).venue?.venueName,
      locationTagName: (concert as any).locationTag?.locationTagName,
      musicTagName: (concert as any).musicTag?.musicTagName,
    }));

    res.status(200).json({
      status: 'success',
      message: '成功取得搜尋資料',
      data: result,
      page: parseInt(page.toString(), 10),
      perPage: take,
      count,
      totalPages: Math.ceil(count / take),
      sortedBy,
    });
  }
);

//---------8. 獲得首頁promo的banner--------
export const getBannerConcerts = handleErrorAsync(
  async (req: Request, res: Response) => {
    const concertRepository = AppDataSource.getRepository(Concert);

    const concerts = await concertRepository.find({
      where: {
        conInfoStatus: 'published',
        cancelledAt: IsNull(),
      },
      order: {
        promotion: 'ASC',
        visitCount: 'ASC',
      },
      select: [
        'concertId',
        'conTitle',
        'conIntroduction',
        'imgBanner',
        'promotion',
        'visitCount',
      ],
      take: 5,
    });

    res.status(200).json({
      message: '取得資料成功',
      status: 'success',
      data: concerts,
    });
  }
);
