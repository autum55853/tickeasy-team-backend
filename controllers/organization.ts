import { Request, Response } from 'express';
import { AppDataSource } from '../config/database.js';
import { Organization } from '../models/organization.js';
// import { User as UserEntity } from '../models/user'; // 確保引入 UserEntity 以便關聯
import { handleErrorAsync, ApiError } from '../utils/index.js';
import {
  CreateOrganizationRequest,
  OrganizationResponse,
  OrganizationData,
  OrganizationsResponse, // 雖然創建時不用，但先引入
} from '../types/organization/index.js';
import { ErrorCode, ApiResponse } from '../types/api.js';

import { Not, IsNull, QueryFailedError } from 'typeorm';
import { Concert } from '../models/concert.js';
import { ConcertsResponse, VALID_SORT_FIELDS } from '../types/concert/index.js';

// 獲取當前用戶擁有的所有組織
export const getAllOrganizations = handleErrorAsync(
  async (req: Request, res: Response<OrganizationsResponse>) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw ApiError.unauthorized();
    }
    const userId = authenticatedUser.userId;

    const organizations = await AppDataSource.getRepository(Organization).find({
      where: { userId: userId }, // 只查找屬於當前用戶的組織
      order: {
        createdAt: 'DESC',
      },
    });

    res.status(200).json({
      status: 'success',
      message: '獲取您的組織列表成功',
      data: { organizations: organizations as OrganizationData[] },
      // TODO: 將來可以加入分頁邏輯
    });
  }
);

// 獲取單個組織 (需要是擁有者)
export const getOrganizationById = handleErrorAsync(
  async (req: Request, res: Response<OrganizationResponse>) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw ApiError.unauthorized();
    }
    const userId = authenticatedUser.userId;
    const { organizationId } = req.params;

    const organizationRepository = AppDataSource.getRepository(Organization);
    const organization = await organizationRepository.findOne({
      where: { organizationId },
    });

    if (!organization) {
      throw ApiError.notFound('組織');
    }

    // 權限檢查：確保請求者是組織的擁有者
    if (organization.userId !== userId) {
      throw ApiError.forbidden();
    }

    res.status(200).json({
      status: 'success',
      message: '獲取組織成功',
      data: { organization: organization as OrganizationData },
    });
  }
);

// 創建組織
export const createOrganization = handleErrorAsync(
  async (req: Request, res: Response<OrganizationResponse>) => {
    // 獲取當前用戶的 userId
    const authenticatedUser = req.user as { userId: string }; // 來自 isAuthenticated
    if (!authenticatedUser || !authenticatedUser.userId) {
      // 理論上 isAuthenticated 會處理，但以防萬一
      throw ApiError.unauthorized();
    }
    const userId = authenticatedUser.userId;

    const {
      orgName,
      orgAddress,
      orgMail,
      orgContact,
      orgMobile,
      orgPhone,
      orgWebsite,
    } = req.body as CreateOrganizationRequest;

    // --- 基本驗證 ---
    const fieldErrors: Record<string, { code: string; message: string }> = {};
    if (!orgName || orgName.trim() === '') {
      fieldErrors.orgName = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織名稱為必填欄位',
      };
    } else if (orgName.length > 100) {
      fieldErrors.orgName = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織名稱長度不能超過 100 個字',
      };
    }
    if (!orgAddress || orgAddress.trim() === '') {
      fieldErrors.orgAddress = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織地址為必填欄位',
      };
    } else if (orgAddress.length > 100) {
      fieldErrors.orgAddress = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織地址長度不能超過 100 個字',
      };
    }
    if (orgMail && orgMail.length > 100) {
      fieldErrors.orgMail = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織信箱長度不能超過 100 個字',
      };
    }
    if (orgContact && orgContact.length > 1000) {
      fieldErrors.orgContact = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織聯絡方式長度不能超過 1000 個字',
      };
    }
    if (orgMobile && orgMobile.length > 200) {
      fieldErrors.orgMobile = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織手機長度不能超過 200 個字',
      };
    }
    if (orgPhone && orgPhone.length > 200) {
      fieldErrors.orgPhone = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織電話長度不能超過 200 個字',
      };
    }
    if (orgWebsite && orgWebsite.length > 200) {
      fieldErrors.orgWebsite = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織網站長度不能超過 200 個字',
      };
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw ApiError.validation('資料驗證失敗', fieldErrors);
    }
    // --- 驗證結束 ---

    const organizationRepository = AppDataSource.getRepository(Organization);

    // 檢查名稱是否重複
    const existingOrg = await organizationRepository.findOne({
      where: { orgName },
    });
    if (existingOrg) {
      throw ApiError.create(
        409,
        '此組織名稱已被使用',
        ErrorCode.DATA_ALREADY_EXISTS
      );
    }

    const newOrganization = organizationRepository.create({
      userId, // 設置創建者的 userId
      orgName,
      orgAddress,
      orgMail,
      orgContact,
      orgMobile,
      orgPhone,
      orgWebsite,
    });

    await organizationRepository.save(newOrganization);

    res.status(201).json({
      status: 'success',
      message: '組織創建成功',
      data: { organization: newOrganization as OrganizationData },
    });
  }
);

// 更新組織 (需要是擁有者)
export const updateOrganization = handleErrorAsync(
  async (req: Request, res: Response<OrganizationResponse>) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw ApiError.unauthorized();
    }
    const userId = authenticatedUser.userId;
    const { organizationId } = req.params;
    const updateData = req.body as Partial<CreateOrganizationRequest>; // 使用 Partial 允許部分更新

    const organizationRepository = AppDataSource.getRepository(Organization);
    const organization = await organizationRepository.findOne({
      where: { organizationId },
    });

    if (!organization) {
      throw ApiError.notFound('組織');
    }

    // 權限檢查：確保請求者是組織的擁有者
    if (organization.userId !== userId) {
      throw ApiError.forbidden();
    }

    // --- 基本驗證 (針對要更新的欄位) ---
    const fieldErrors: Record<string, { code: string; message: string }> = {};
    if (updateData.orgName !== undefined) {
      if (updateData.orgName.trim() === '') {
        fieldErrors.orgName = {
          code: ErrorCode.VALIDATION_FAILED,
          message: '組織名稱不能為空',
        };
      } else if (updateData.orgName.length > 100) {
        fieldErrors.orgName = {
          code: ErrorCode.VALIDATION_FAILED,
          message: '組織名稱長度不能超過 100 個字',
        };
      }
    }
    if (updateData.orgAddress !== undefined) {
      if (updateData.orgAddress.trim() === '') {
        fieldErrors.orgAddress = {
          code: ErrorCode.VALIDATION_FAILED,
          message: '組織地址不能為空',
        };
      } else if (updateData.orgAddress.length > 100) {
        fieldErrors.orgAddress = {
          code: ErrorCode.VALIDATION_FAILED,
          message: '組織地址長度不能超過 100 個字',
        };
      }
    }
    if (updateData.orgMail !== undefined && updateData.orgMail.length > 100) {
      fieldErrors.orgMail = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織信箱長度不能超過 100 個字',
      };
    }
    if (
      updateData.orgContact !== undefined &&
      updateData.orgContact.length > 1000
    ) {
      fieldErrors.orgContact = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織聯絡方式長度不能超過 1000 個字',
      };
    }
    if (
      updateData.orgMobile !== undefined &&
      updateData.orgMobile.length > 200
    ) {
      fieldErrors.orgMobile = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織手機長度不能超過 200 個字',
      };
    }
    if (updateData.orgPhone !== undefined && updateData.orgPhone.length > 200) {
      fieldErrors.orgPhone = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織電話長度不能超過 200 個字',
      };
    }
    if (
      updateData.orgWebsite !== undefined &&
      updateData.orgWebsite.length > 200
    ) {
      fieldErrors.orgWebsite = {
        code: ErrorCode.VALIDATION_FAILED,
        message: '組織網站長度不能超過 200 個字',
      };
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw ApiError.validation('資料驗證失敗', fieldErrors);
    }
    // --- 驗證結束 ---

    // 檢查名稱是否與其他組織重複 (排除自己)
    if (
      updateData.orgName !== undefined &&
      updateData.orgName !== organization.orgName
    ) {
      const existingOrg = await organizationRepository.findOne({
        where: {
          orgName: updateData.orgName,
          organizationId: Not(organizationId), // 確保不是當前正在更新的組織
        },
      });
      if (existingOrg) {
        throw ApiError.create(
          409,
          '此組織名稱已被其他組織使用',
          ErrorCode.DATA_ALREADY_EXISTS
        );
      }
    }

    // 更新資料 (只更新請求中提供的欄位)
    Object.assign(organization, updateData);

    await organizationRepository.save(organization);

    res.status(200).json({
      status: 'success',
      message: '組織更新成功',
      data: { organization: organization as OrganizationData },
    });
    // res.status(501).json({ status:'failed', message: `Not Implemented: ${organizationId}` });
  }
);

// 刪除組織 (需要是擁有者)
export const deleteOrganization = handleErrorAsync(
  async (req: Request, res: Response<ApiResponse<null>>) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw ApiError.unauthorized();
    }
    const userId = authenticatedUser.userId;
    const { organizationId } = req.params;

    const organizationRepository = AppDataSource.getRepository(Organization);
    const organization = await organizationRepository.findOne({
      where: { organizationId },
    });

    if (!organization) {
      throw ApiError.notFound('組織');
    }

    // 權限檢查：確保請求者是組織的擁有者
    if (organization.userId !== userId) {
      throw ApiError.forbidden();
    }

    // 執行硬刪除，若有外鍵約束違反則給出友善提示
    try {
      await organizationRepository.remove(organization);
    } catch (error) {
      // PostgreSQL 外鍵違反錯誤代碼 23503
      if (error instanceof QueryFailedError && (error as any).code === '23503') {
        throw ApiError.dataConstraintViolation('刪除失敗：該組織仍關聯音樂會，請先刪除或轉移相關音樂會');
      }
      // 其他資料庫錯誤
      throw ApiError.databaseError();
    }

    res.status(200).json({
      status: 'success',
      message: '組織刪除成功',
      data: null, // 刪除成功通常不返回 data
    });
    // res.status(501).json({ status:'failed', message: `Not Implemented: ${organizationId}` });
  }
);

// 取得特定組織的音樂會列表（含分頁、篩選、排序）
export const getConcertsByOrganization = handleErrorAsync(
  async (req, res: Response<ConcertsResponse>) => {
    const authenticatedUser = req.user as { userId: string };
    if (!authenticatedUser || !authenticatedUser.userId) {
      throw ApiError.unauthorized();
    }
    const userId = authenticatedUser.userId;
    const { organizationId } = req.params;
    const { status, limit = 10, page = 1, sort } = req.query;

    // 權限檢查：必須是組織擁有者
    const organizationRepository = AppDataSource.getRepository(Organization);
    const organization = await organizationRepository.findOne({
      where: { organizationId },
    });
    if (!organization) {
      throw ApiError.notFound('組織');
    }
    if (organization.userId !== userId) {
      throw ApiError.forbidden();
    }

    // 組合 where 條件
    const where: any = { organizationId, cancelledAt: IsNull() };
    if (status) where.conInfoStatus = status;

    // 組合排序
    let order: any = {};
    if (sort) {
      sort
        .toString()
        .split(',')
        .forEach((s: string) => {
          const [field, dir] = s.split(':');
          // 驗證排序欄位是否有效
          if (field && VALID_SORT_FIELDS.includes(field as any)) {
            order[field] = dir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
          }
        });
    } else {
      order = { eventStartDate: 'DESC' };
    }

    // 分頁
    const take = Math.max(1, Number(limit) || 10);
    const currentPage = Math.max(1, Number(page) || 1);
    const skip = (currentPage - 1) * take;

    // 查詢
    const concertRepository = AppDataSource.getRepository(Concert);
    const [concerts, totalCount] = await concertRepository.findAndCount({
      where,
      order,
      skip,
      take,
      relations: [
        'sessions',
        'sessions.ticketTypes',
        'venue',
        'locationTag',
        'musicTag'
      ],
    });

    const totalPages = Math.ceil(totalCount / take);

    res.status(200).json({
      status: 'success',
      message: '成功獲取音樂會列表',
      data: {
        concerts: concerts.map((concert) => ({
          concertId: concert.concertId,
          organizationId: concert.organizationId,
          venueId: concert.venueId,
          locationTagId: concert.locationTagId,
          musicTagId: concert.musicTagId,
          conTitle: concert.conTitle,
          conIntroduction: concert.conIntroduction,
          conLocation: concert.conLocation,
          conAddress: concert.conAddress,
          eventStartDate: concert.eventStartDate ? 
            (concert.eventStartDate instanceof Date ? concert.eventStartDate.toISOString() : concert.eventStartDate) 
            : undefined,
          eventEndDate: concert.eventEndDate ? 
            (concert.eventEndDate instanceof Date ? concert.eventEndDate.toISOString() : concert.eventEndDate) 
            : undefined,
          imgBanner: concert.imgBanner,
          ticketPurchaseMethod: concert.ticketPurchaseMethod,
          precautions: concert.precautions,
          refundPolicy: concert.refundPolicy,
          conInfoStatus: concert.conInfoStatus,
          reviewStatus: concert.reviewStatus,
          visitCount: concert.visitCount,
          promotion: concert.promotion ?? 0,
          cancelledAt: concert.cancelledAt ? 
            (concert.cancelledAt instanceof Date ? concert.cancelledAt.toISOString() : concert.cancelledAt) 
            : undefined,
          createdAt: concert.createdAt.toISOString(),
          updatedAt: concert.updatedAt.toISOString(),
          sessions: concert.sessions?.map(session => ({
            sessionId: session.sessionId,
            sessionTitle: session.sessionTitle,
            sessionDate: new Date(session.sessionDate).toISOString(),
            sessionStart: session.sessionStart,
            sessionEnd: session.sessionEnd,
            imgSeattable: session.imgSeattable,
            ticketTypes: session.ticketTypes?.map(ticket => ({
              ticketTypeId: ticket.ticketTypeId,
              ticketTypeName: ticket.ticketTypeName,
              entranceType: ticket.entranceType,
              ticketBenefits: ticket.ticketBenefits,
              ticketRefundPolicy: ticket.ticketRefundPolicy,
              ticketTypePrice: ticket.ticketTypePrice,
              totalQuantity: ticket.totalQuantity,
              remainingQuantity: ticket.remainingQuantity,
              sellBeginDate: new Date(ticket.sellBeginDate).toISOString(),
              sellEndDate: new Date(ticket.sellEndDate).toISOString(),
            })) || []
          })) || []
        })),

        pagination: {
          totalCount,
          totalPages,
          currentPage,
          limit: take,
        },
      },
    });
  }
);
