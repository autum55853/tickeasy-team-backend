import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database.js';
import { handleErrorAsync } from '../../utils/handleErrorAsync.js';
import { ApiError } from '../../utils/index.js';
import { LocationTag } from '../../models/location-tag.js';
import { MusicTag } from '../../models/music-tag.js';

//------------11. 獲得 location tags -------------
export const getLocationTags = handleErrorAsync(
  async (req: Request, res: Response) => {
    const locationTagRepository = AppDataSource.getRepository(LocationTag);

    const locationTags = await locationTagRepository.find();

    if (!locationTags.length) {
      throw ApiError.notFound('地點標籤資料');
    }

    res.status(200).json({
      status: 'success',
      message: '成功取得地點標籤',
      data: locationTags,
    });
  }
);

//------------12. 獲得music tags-------------
export const getMusicTags = handleErrorAsync(
  async (req: Request, res: Response) => {
    const musicTagRepository = AppDataSource.getRepository(MusicTag);

    const musicTags = await musicTagRepository.find();

    if (!musicTags.length) {
      throw ApiError.notFound('音樂類型標籤資料');
    }

    res.status(200).json({
      status: 'success',
      message: '成功取得音樂標籤',
      data: musicTags,
    });
  }
);
