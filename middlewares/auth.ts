import jwt from 'jsonwebtoken';
import { User as UserEntity } from '../models/user.js';
import { Request, Response, NextFunction } from 'express';
import { TokenPayload } from '../types/auth/jwt.js';
import { AppDataSource } from '../config/database.js';
import { ApiError } from '../utils/index.js';
import { ErrorCode } from '../types/api.js';

/**
 * 驗證用戶是否已登入的中間件
 */
export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 獲取Authorization頭
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized();
    }

    // 獲取令牌
    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized();
    }

    // 驗證令牌
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret') as TokenPayload;
    if (!decoded.userId) {
      throw ApiError.create(401, '無效的認證令牌', ErrorCode.AUTH_TOKEN_INVALID); // Replaced with a string literal
    }

    // 查找用戶
    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { userId: decoded.userId } });
    if (!user) {
      throw ApiError.notFound('用戶');
    }

    // 在請求對象中設置用戶信息
    req.user = {
      userId: user.userId,
      role: user.role,
      email: user.email,
      name: user.name,
      isEmailVerified: user.isEmailVerified
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(ApiError.create(401, '無效的認證令牌', ErrorCode.AUTH_TOKEN_INVALID));
    }
    next(error);
  }
};

/**
 * 可選的身份驗證中間件
 * 如果提供了令牌則驗證，未提供則跳過但不阻止請求
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    // 有 token 則進行驗證
    jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err: any, decoded: any) => {
      if (err) {
        return res.status(401).json({
          success: false,
          message: 'Token 無效'
        });
      }
      
      req.user = decoded;
      next();
    });
  } else {
    // 沒有 token 則設為匿名用戶
    req.user = undefined;
    next();
  }
};

/**
 * 驗證用戶是否為管理員的中間件
 */
export const isAdmin = async (req: Request, res: Response, next: NextFunction) => {
    // 這個中介軟體應該在 isAuthenticated 之後使用
    const user = req.user as { role: string; [key: string]: any };

    if (!user) {
      return next(ApiError.unauthorized());
    }
    
    if (user.role !== 'admin' && user.role !== 'superuser') {
      return next(
        ApiError.forbidden()
      );
    }
    next();
  };

/**
 * 管理員權限驗證中間件
 */
export const adminAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await isAuthenticated(req, res, (err) => {
      if (err) {
        return next(err);
      }
      
      if (req.user) {
        const user = req.user as any;
        const userRole = String(user.role).toLowerCase();
        if (userRole !== 'admin' && userRole !== 'superuser') {
          throw ApiError.forbidden();
        }
      }
      next();
    });
  } catch (error) {
    next(ApiError.unauthorized());
    console.log(error);
  }
};

/**
 * 確保用戶已完成信箱驗證的中間件
 * 僅當 isAuthenticated 已經將 user 注入 req 時使用
 */
export const requireVerifiedEmail = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user as { isEmailVerified?: boolean };
  if (!user?.isEmailVerified) {
    return next(ApiError.emailNotVerified());
  }
  next();
};

/**
 * 會話權限檢查中介軟體
 * 檢查用戶是否有權限訪問指定會話
 */
export const checkSessionAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId } = req.params;
    const userId = (req.user as any)?.userId;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: '缺少會話 ID'
      });
    }

    // 如果是登入用戶，檢查會話所有權
    if (userId) {
      const { AppDataSource } = await import('../config/database.js');
      const { SupportSession } = await import('../models/support-session.js');
      
      const supportSessionRepo = AppDataSource.getRepository(SupportSession);
      const session = await supportSessionRepo.findOne({
        where: { supportSessionId: sessionId, userId }
      });

      if (!session) {
        return res.status(403).json({
          success: false,
          message: '無權限訪問此會話'
        });
      }
    } else {
      // 匿名用戶只能訪問自己建立的會話
      // 這裡可以透過 session 或其他方式來驗證
      // 暫時允許匿名用戶訪問（可根據需求調整）
    }

    next();
  } catch (error) {
    console.error('❌ 會話權限檢查失敗:', error);
    res.status(500).json({
      success: false,
      message: '權限檢查失敗'
    });
  }
};
