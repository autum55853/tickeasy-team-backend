import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '../models/user.js';
import { generateToken, handleErrorAsync, ApiError } from '../utils/index.js';
import {
    sendVerificationEmail,
    sendPasswordResetEmail,
} from '../utils/email.js';
import { IsNull, Not, MoreThan } from 'typeorm';
import { AppDataSource } from '../config/database.js';
import {
    RegisterRequest,
    LoginRequest,
    VerifyEmailRequest,
    ResendVerificationRequest,
    RequestPasswordResetRequest,
    ResetPasswordRequest,
    GoogleRequestUser,
    ChangePasswordRequest,
} from '../types/auth/requests.js';

import { VerificationResponseData, UserData } from '../types/auth/responses.js';

import { ErrorCode } from '../types/api.js';
import { Buffer } from 'buffer';
import { URL } from 'url';

// Google 登入相關介面 - 修正為與 Passport 實際回傳結構一致
interface GoogleRequest extends Omit<Request, 'user'> {
    user?: UserData;  // 直接使用 UserData，因為 Passport 回傳的就是這個結構
    query: {
        state?: string;
        [key: string]: string | undefined;
    };
}

// 註冊新用戶
export const register = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email, password, name, nickname, phone, birthday } =
            req.body as RegisterRequest;

        // 使用字段級錯誤收集
        const fieldErrors: Record<string, { code: string; message: string }> =
            {};

        // 檢查必要參數
        if (!email) {
            fieldErrors.email = {
                code: ErrorCode.AUTH_EMAIL_REQUIRED,
                message: 'Email 為必填欄位',
            };
        }
        if (!password) {
            fieldErrors.password = {
                code: ErrorCode.AUTH_PASSWORD_REQUIRED,
                message: '密碼為必填欄位',
            };
        }
        if (!name) {
            fieldErrors.name = {
                code: ErrorCode.AUTH_NAME_REQUIRED,
                message: '姓名為必填欄位',
            };
        }

        // 如果有字段錯誤，立即返回所有錯誤
        if (Object.keys(fieldErrors).length > 0) {
            throw ApiError.validation('表單驗證失敗', fieldErrors);
        }

        // 驗證電子郵件長度和格式
        if (email.length < 5 || email.length > 100) {
            throw ApiError.invalidEmailLength();
        }

        // 驗證密碼格式：至少8碼，英文+數字混合
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
        if (!passwordRegex.test(password)) {
            throw ApiError.invalidPasswordFormat();
        }

        // 驗證姓名長度
        if (name.length < 2 || name.length > 50) {
            throw ApiError.invalidNameLength();
        }

        // 驗證暱稱長度（如果提供了暱稱）
        if (nickname && (nickname.length < 1 || nickname.length > 20)) {
            throw ApiError.invalidNicknameLength();
        }

        // 檢查 email 是否已經被註冊
        const userRepository = AppDataSource.getRepository(User);
        const existingUser = await userRepository.findOne({
            where: { email },
        });

        if (existingUser) {
            throw ApiError.emailExists();
        }

        // 創建新用戶
        const newUser = new User();
        newUser.email = email;
        newUser.password = password;
        newUser.name = name;
        newUser.nickname = nickname || '';
        newUser.phone = phone || '';
        newUser.birthday = birthday
            ? new Date(birthday)
            : (null as unknown as Date);
        newUser.role = UserRole.USER;
        newUser.isEmailVerified = false;
        newUser.oauthProviders = [];

        // 在第一次保存前生成驗證碼並設置相關字段
        const { code } = await newUser.createVerificationToken();

        // 只保存一次，觸發 @BeforeInsert -> hashPassword
        await userRepository.save(newUser);

        // 發送驗證郵件
        await sendVerificationEmail(email, code);

        // 生成 JWT
        const jwtToken = generateToken({
            userId: newUser.userId,
            role: newUser.role,
        });

        const userData: UserData = {
            userId: newUser.userId,
            email: newUser.email,
            role: newUser.role,
            name: newUser.name,
            nickname: newUser.nickname,
            phone: newUser.phone,
            birthday: newUser.birthday,
            isEmailVerified: newUser.isEmailVerified,
        };

        res.status(201).json({
            status: 'success',
            message: '註冊成功，請檢查郵箱完成驗證',
            data: {
                token: jwtToken,
                user: userData,
            },
        });
    } catch (err) {
        next(err);
    }
};

// 用戶登入
export const login = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email, password } = req.body as LoginRequest;

        // 使用字段級錯誤收集
        const fieldErrors: Record<string, { code: string; message: string }> =
            {};

        // 檢查必要參數
        if (!email) {
            fieldErrors.email = {
                code: ErrorCode.AUTH_EMAIL_REQUIRED,
                message: 'Email 為必填欄位',
            };
        }

        if (!password) {
            fieldErrors.password = {
                code: ErrorCode.AUTH_PASSWORD_REQUIRED,
                message: '密碼為必填欄位',
            };
        }

        // 如果有字段錯誤，立即返回所有錯誤
        if (Object.keys(fieldErrors).length > 0) {
            throw ApiError.validation('表單驗證失敗', fieldErrors);
        }

        try {
            // 查找用戶
            const userRepository = AppDataSource.getRepository(User);
            const user = await userRepository.findOne({
                where: { email },
                select: [
                    'userId',
                    'email',
                    'password',
                    'role',
                    'name',
                    'nickname',
                    'phone',
                    'birthday',
                    'avatar',
                    'isEmailVerified',
                ],
            });

            if (!user || !(await user.comparePassword(password))) {
                throw ApiError.invalidCredentials();
            }

            // 生成 JWT
            const token = generateToken({
                userId: user.userId,
                role: user.role,
            });

            // 移除敏感字段
            const userData: UserData = {
                userId: user.userId,
                email: user.email,
                role: user.role,
                name: user.name,
                nickname: user.nickname,
                phone: user.phone,
                birthday: user.birthday,
                avatar: user.avatar,
                isEmailVerified: user.isEmailVerified,
            };

            res.status(200).json({
                status: 'success',
                message: '登入成功',
                data: {
                    token,
                    user: userData,
                },
            });
        } catch (err) {
            // 處理數據庫操作錯誤
            if (
                err instanceof Error &&
                err.name === 'EntityPropertyNotFoundError'
            ) {
                throw ApiError.databaseError();
            }
            throw err; // 重新拋出其他錯誤
        }
    } catch (err) {
        next(err);
    }
};

// Google 登入
export const googleLogin = handleErrorAsync(
    async (req: Request, res: Response) => {
        const googleReq = req as GoogleRequest;

        // 檢查必要的用戶數據
        if (!googleReq.user) {
            throw ApiError.create(
                400,
                '未收到 Google 用戶資料',
                ErrorCode.AUTH_INVALID_CREDENTIALS
            );
        }

        if (!googleReq.user.userId) {
            throw ApiError.create(
                400,
                '未找到用戶識別碼',
                ErrorCode.DATA_INVALID
            );
        }

        // 生成 token，包含用戶 ID 和角色
        const token = generateToken({
            userId: googleReq.user.userId,
            role: googleReq.user.role || 'user', // 確保有默認角色
        });

        // 準備返回的用戶資料
        const userData = {
            userId: googleReq.user.userId,
            name: googleReq.user.name,
            email: googleReq.user.email,
            avatar: googleReq.user.avatar,
            role: googleReq.user.role,
            oauthProviders: googleReq.user.oauthProviders,
            phone: googleReq.user.phone,
            address: googleReq.user.address,
            birthday: googleReq.user.birthday,
            gender: googleReq.user.gender,
            isEmailVerified: googleReq.user.isEmailVerified,
        };

        // 如果是 POST 請求 (直接從前端發來的)
        if (req.method === 'POST') {
            return res.json({
                status: 'success',
                message: '登入成功',
                data: {
                    token,
                    user: userData,
                },
            });
        }

        // 如果是 GET 請求 (來自 Google 重定向)
        let finalRedirectUrl =
            process.env.FRONTEND_URL || 'http://localhost:3000/login/success'; // 預設前端登入成功頁面
        const stateFromQuery = googleReq.query.state as string;

        if (stateFromQuery) {
            try {
                const decodedJsonString = Buffer.from(
                    stateFromQuery,
                    'base64'
                ).toString('utf-8');
                const originalQueryParams = JSON.parse(decodedJsonString);

                // 前端是透過 ?state=URL 傳遞重定向目標，因此解碼後的物件中，目標URL會儲存在 state 屬性中
                if (
                    originalQueryParams &&
                    typeof originalQueryParams.state === 'string' &&
                    originalQueryParams.state
                ) {
                    finalRedirectUrl = originalQueryParams.state;
                    // 可選：驗證 originalQueryParams.state 是否為有效的 URL
                    try {
                        new URL(finalRedirectUrl); // 如果 URL 無效，會拋出錯誤
                    } catch {
                        finalRedirectUrl =
                            process.env.FRONTEND_URL ||
                            'http://localhost:3000/login/success'; // 無效則退回預設值
                    }
                } else {
                    // 如果解碼後的 state 物件中沒有 state 屬性，或其值不是有效的字串
                    // console.warn('State 參數已解碼，但未找到有效的 state 屬性作為重導向 URL，將使用預設重導向 URL。原始 state 內容:', originalQueryParams);
                    // 如果沒有有效的 state.state，則使用預設的 finalRedirectUrl
                }
            } catch {
                // console.error('無法解析從 Google callback 傳回的 state，將使用預設重導向 URL:', error);
                // 如果解碼失敗，仍然重導向到預設的前端頁面，finalRedirectUrl 已被初始化為預設值
            }
        } else {
            // console.warn('Google callback 未收到 state 參數，將使用預設重導向 URL。');
            // 如果沒有 stateFromQuery，使用預設的 finalRedirectUrl
        }

        res.redirect(`${finalRedirectUrl}?token=${token}`);
    }
);

// 驗證電子郵件
export const verifyEmail = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email, code } = req.body as VerifyEmailRequest;

        // 使用字段級錯誤收集
        const fieldErrors: Record<string, { code: string; message: string }> =
            {};

        // 檢查必要參數
        if (!email) {
            fieldErrors.email = {
                code: ErrorCode.AUTH_EMAIL_REQUIRED,
                message: 'Email 為必填欄位',
            };
        }

        if (!code) {
            fieldErrors.code = {
                code: ErrorCode.VALIDATION_FAILED,
                message: '驗證碼為必填欄位',
            };
        }

        // 如果有字段錯誤，立即返回所有錯誤
        if (Object.keys(fieldErrors).length > 0) {
            throw ApiError.validation('表單驗證失敗', fieldErrors);
        }

        // 查找用戶
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: {
                email,
                verificationToken: Not(IsNull()),
                verificationTokenExpires: MoreThan(new Date()),
            },
        });

        if (!user) {
            throw ApiError.create(
                400,
                '驗證碼無效或已過期',
                ErrorCode.AUTH_TOKEN_EXPIRED
            );
        }

        // 檢查驗證碼
        if (user.verificationToken !== code) {
            throw ApiError.create(
                400,
                '驗證碼不正確',
                ErrorCode.AUTH_TOKEN_INVALID
            );
        }

        // 更新用戶狀態
        user.isEmailVerified = true;
        user.verificationToken = '';
        user.verificationTokenExpires = new Date(0);
        await userRepository.save(user);

        const responseData: VerificationResponseData = {
            isEmailVerified: true,
        };

        res.status(200).json({
            status: 'success',
            message: 'Email 驗證成功',
            data: responseData,
        });
    } catch (err) {
        next(err);
    }
};

// 重新發送驗證碼
export const resendVerification = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email } = req.body as ResendVerificationRequest;

        // 檢查必要參數
        if (!email) {
            throw ApiError.emailRequired();
        }

        // 查找用戶
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: { email },
        });

        if (!user) {
            throw ApiError.notFound('使用者');
        }

        if (user.isEmailVerified) {
            throw ApiError.create(
                400,
                '此 Email 已經驗證過了',
                ErrorCode.DATA_ALREADY_EXISTS
            );
        }

        // 檢查是否在10分鐘內已經發送過驗證郵件
        const lastAttempt = user.lastVerificationAttempt;
        if (
            lastAttempt &&
            new Date().getTime() - lastAttempt.getTime() < 10 * 60 * 1000
        ) {
            const remainingSeconds = Math.ceil(
                (10 * 60 * 1000 -
                    (new Date().getTime() - lastAttempt.getTime())) /
                    1000
            );
            throw ApiError.rateLimitExceeded(remainingSeconds);
        }

        // 生成新的驗證碼
        const code = Array(6)
            .fill(0)
            .map(() => Math.floor(Math.random() * 10))
            .join('');

        // 直接更新用戶數據
        user.verificationToken = code;
        user.verificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10分鐘
        user.lastVerificationAttempt = new Date();

        // 保存到數據庫
        await userRepository.save(user);

        // 發送驗證郵件
        await sendVerificationEmail(email, code);

        res.status(200).json({
            status: 'success',
            message: '驗證郵件已發送，請檢查您的郵箱',
        });
    } catch (err) {
        next(err);
    }
};

// 請求密碼重置
export const requestPasswordReset = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email } = req.body as RequestPasswordResetRequest;

        // 檢查必要參數
        if (!email) {
            throw ApiError.emailRequired();
        }

        // 查找用戶
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: { email },
        });

        if (!user) {
            throw ApiError.notFound('使用者');
        }

        // 檢查是否在10分鐘內已經發送過重置郵件
        const lastAttempt = user.lastPasswordResetAttempt;
        if (
            lastAttempt &&
            new Date().getTime() - lastAttempt.getTime() < 10 * 60 * 1000
        ) {
            const remainingSeconds = Math.ceil(
                (10 * 60 * 1000 -
                    (new Date().getTime() - lastAttempt.getTime())) /
                    1000
            );
            throw ApiError.rateLimitExceeded(remainingSeconds);
        }

        // 生成密碼重置碼
        const { code } = await user.createPasswordResetToken();
        // const { token } = await user.createPasswordResetToken();

        // 保存更新後的用戶數據
        await userRepository.save(user);

        // 發送密碼重置郵件
        await sendPasswordResetEmail(email, code);

        res.status(200).json({
            status: 'success',
            message: '密碼重置郵件已發送，請檢查您的郵箱',
        });
    } catch (err) {
        next(err);
    }
};

// 重置密碼
export const resetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email, code, newPassword } = req.body as ResetPasswordRequest;

        // 使用字段級錯誤收集
        const fieldErrors: Record<string, { code: string; message: string }> =
            {};

        // 檢查必要參數
        if (!email) {
            fieldErrors.email = {
                code: ErrorCode.AUTH_EMAIL_REQUIRED,
                message: 'Email 為必填欄位',
            };
        }

        if (!code) {
            fieldErrors.code = {
                code: ErrorCode.VALIDATION_FAILED,
                message: '驗證碼為必填欄位',
            };
        }

        if (!newPassword) {
            fieldErrors.newPassword = {
                code: ErrorCode.VALIDATION_FAILED,
                message: '新密碼為必填欄位',
            };
        }

        // 如果有字段錯誤，立即返回所有錯誤
        if (Object.keys(fieldErrors).length > 0) {
            throw ApiError.validation('表單驗證失敗', fieldErrors);
        }

        // 密碼格式驗證
        const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            throw ApiError.invalidPasswordFormat();
        }

        // 查找用戶
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: {
                email,
                passwordResetToken: Not(IsNull()),
                passwordResetExpires: MoreThan(new Date()),
            },
        });

        if (!user) {
            throw ApiError.create(
                400,
                '重置碼無效或已過期',
                ErrorCode.AUTH_TOKEN_EXPIRED
            );
        }

        // 檢查重置碼
        if (user.passwordResetToken !== code) {
            throw ApiError.create(
                400,
                '重置碼不正確',
                ErrorCode.AUTH_TOKEN_INVALID
            );
        }

        // 更新密碼
        user.password = newPassword;
        user.passwordResetToken = '';
        user.passwordResetExpires = new Date(0);
        await userRepository.save(user);

        res.status(200).json({
            status: 'success',
            message: '密碼重置成功，請使用新密碼登入',
        });
    } catch (err) {
        next(err);
    }
};

// ------------------ 已登入用戶變更密碼 ------------------
export const changePassword = handleErrorAsync(
    async (req: Request, res: Response) => {
        const { oldPassword, newPassword } = req.body as ChangePasswordRequest;
        const authenticated = req.user as { userId: string };

        // 基本檢查
        const fieldErrors: Record<string, { code: string; message: string }> = {};
        if (!oldPassword) {
            fieldErrors.oldPassword = {
                code: ErrorCode.AUTH_PASSWORD_REQUIRED,
                message: '舊密碼為必填欄位',
            };
        }
        if (!newPassword) {
            fieldErrors.newPassword = {
                code: ErrorCode.AUTH_PASSWORD_REQUIRED,
                message: '新密碼為必填欄位',
            };
        }
        if (Object.keys(fieldErrors).length > 0) {
            throw ApiError.validation('表單驗證失敗', fieldErrors);
        }

        // 新密碼格式
        const pwRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
        if (!pwRegex.test(newPassword)) {
            throw ApiError.invalidPasswordFormat();
        }

        // 取得用戶
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: { userId: authenticated.userId },
            select: ['userId', 'password'],
        });
        if (!user) {
            throw ApiError.notFound('用戶');
        }

        // 比對舊密碼
        if (!(await user.comparePassword(oldPassword))) {
            throw ApiError.invalidOldPassword();
        }

        // 更新密碼
        user.password = newPassword;
        await userRepository.save(user);

        res.status(200).json({
            status: 'success',
            message: '密碼變更成功，請使用新密碼重新登入',
        });
    }
);
