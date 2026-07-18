import { Request, Response } from 'express';
import { AppDataSource } from '../../config/database.js';
import { handleErrorAsync } from '../../utils/handleErrorAsync.js';
import { ApiError } from '../../utils/index.js';
import { ErrorCode } from '../../types/api.js';
import { Venue } from '../../models/venue.js';

// ------------3. 獲得場地的資料-------------
export const getAllVenues = handleErrorAsync(
  async (req: Request, res: Response) => {
    const venueRepository = AppDataSource.getRepository(Venue);
    const venues = await venueRepository.find();
    res.status(200).json({
      message: '成功取得場館資料',
      status: 'success',
      data: venues,
    });
  }
);

// ------------3b. 更新場地資料-------------
export const updateVenue = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { venueId } = req.params;
    const {
      venueName,
      venueDescription,
      venueAddress,
      venueCapacity,
      venueImageUrl,
      googleMapUrl,
      isAccessible,
      hasParking,
      hasTransit,
    } = req.body;

    const venueRepository = AppDataSource.getRepository(Venue);
    const venue = await venueRepository.findOne({ where: { venueId } });
    if (!venue) {
      throw ApiError.notFound('場地');
    }

    if (venueName !== undefined) venue.venueName = venueName;
    if (venueDescription !== undefined) venue.venueDescription = venueDescription;
    if (venueAddress !== undefined) venue.venueAddress = venueAddress;
    if (venueCapacity !== undefined) venue.venueCapacity = venueCapacity;
    if (venueImageUrl !== undefined) venue.venueImageUrl = venueImageUrl;
    if (googleMapUrl !== undefined) venue.googleMapUrl = googleMapUrl;
    if (isAccessible !== undefined) venue.isAccessible = isAccessible;
    if (hasParking !== undefined) venue.hasParking = hasParking;
    if (hasTransit !== undefined) venue.hasTransit = hasTransit;

    const updated = await venueRepository.save(venue);

    res.status(200).json({
      status: 'success',
      message: '成功更新場地資料',
      data: updated,
    });
  }
);

// ------------3c. 新增場地-------------
export const createVenue = handleErrorAsync(
  async (req: Request, res: Response) => {
    const {
      venueName,
      venueDescription,
      venueAddress,
      venueCapacity,
      venueImageUrl,
      googleMapUrl,
      isAccessible,
      hasParking,
      hasTransit,
    } = req.body;

    if (
      venueName === undefined || venueName === null || venueName === '' ||
      venueDescription === undefined || venueDescription === null ||
      venueAddress === undefined || venueAddress === null || venueAddress === '' ||
      venueCapacity === undefined || venueCapacity === null ||
      venueImageUrl === undefined || venueImageUrl === null ||
      googleMapUrl === undefined || googleMapUrl === null ||
      isAccessible === undefined || isAccessible === null ||
      hasParking === undefined || hasParking === null ||
      hasTransit === undefined || hasTransit === null
    ) {
      throw ApiError.create(400, '所有場地欄位皆為必填', ErrorCode.VALIDATION_FAILED);
    }

    const venueRepository = AppDataSource.getRepository(Venue);
    const venue = venueRepository.create({
      venueName,
      venueDescription,
      venueAddress,
      venueCapacity,
      venueImageUrl,
      googleMapUrl,
      isAccessible,
      hasParking,
      hasTransit,
    });

    const saved = await venueRepository.save(venue);

    res.status(201).json({
      status: 'success',
      message: '成功新增場地',
      data: saved,
    });
  }
);

// ------------3d. 刪除場地（軟刪除）-------------
export const deleteVenue = handleErrorAsync(
  async (req: Request, res: Response) => {
    const { venueId } = req.params;

    const venueRepository = AppDataSource.getRepository(Venue);
    const venue = await venueRepository.findOne({ where: { venueId } });
    if (!venue) {
      throw ApiError.notFound('場地');
    }

    await venueRepository.softRemove(venue);

    res.status(200).json({
      status: 'success',
      message: '成功刪除場地',
    });
  }
);
