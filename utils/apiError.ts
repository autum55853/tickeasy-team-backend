import createHttpError from 'http-errors';
import { ErrorCode } from '../types/api.js';

/**
 * 字段錯誤接口
 */
interface FieldError {
  code: string;
  message: string;
}

/**
 * API錯誤處理輔助工具
 */
export class ApiError {
  /**
   * 創建一個帶有錯誤碼的HTTP錯誤
   * @param statusCode HTTP狀態碼
   * @param message 錯誤消息
   * @param errorCode 錯誤碼
   * @returns HTTP錯誤對象
   */
  static create(statusCode: number, message: string, errorCode: ErrorCode) {
    const error = createHttpError(statusCode, message);
    (error as any).code = errorCode;
    return error;
  }

  /**
   * 創建包含字段錯誤的驗證錯誤
   * @param message 錯誤概述
   * @param fieldErrors 字段錯誤映射
   * @returns HTTP錯誤對象
   */
  static validation(message: string, fieldErrors: Record<string, FieldError>) {
    const error = createHttpError(400, message);
    (error as any).code = ErrorCode.VALIDATION_FAILED;
    (error as any).fieldErrors = fieldErrors;
    return error;
  }

  // 身份認證錯誤
  static emailRequired() {
    return this.create(400, 'Email 為必填欄位', ErrorCode.AUTH_EMAIL_REQUIRED);
  }

  static passwordRequired() {
    return this.create(400, '密碼為必填欄位', ErrorCode.AUTH_PASSWORD_REQUIRED);
  }

  static nameRequired() {
    return this.create(400, '姓名為必填欄位', ErrorCode.AUTH_NAME_REQUIRED);
  }

  static emailExists() {
    return this.create(409, '此 Email 已經被註冊', ErrorCode.AUTH_EMAIL_EXISTS);
  }

  static invalidCredentials() {
    return this.create(401, 'Email 或密碼不正確', ErrorCode.AUTH_INVALID_CREDENTIALS);
  }

  static unauthorized() {
    return this.create(401, '請先登入', ErrorCode.AUTH_UNAUTHORIZED);
  }

  static forbidden() {
    return this.create(403, '您沒有權限執行此操作', ErrorCode.AUTH_FORBIDDEN);
  }

  // 信箱未驗證錯誤
  static emailNotVerified() {
    return this.create(403, '請先完成信箱驗證', ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
  }

  // 舊密碼錯誤
  static invalidOldPassword() {
    return this.create(400, '舊密碼不正確', ErrorCode.AUTH_INVALID_OLD_PASSWORD);
  }

  // 數據驗證錯誤
  static invalidEmailFormat() {
    return this.create(400, 'Email 格式不正確', ErrorCode.VALIDATION_EMAIL_FORMAT);
  }

  static invalidEmailLength() {
    return this.create(400, 'Email 長度必須在5到100個字元之間', ErrorCode.VALIDATION_EMAIL_LENGTH);
  }

  static invalidPasswordFormat() {
    return this.create(400, '密碼格式不正確，需至少8碼且包含英文和數字', ErrorCode.VALIDATION_PASSWORD_FORMAT);
  }

  static invalidNameLength() {
    return this.create(400, '姓名必須介於2到50個字符之間', ErrorCode.VALIDATION_NAME_LENGTH);
  }

  static invalidNicknameLength() {
    return this.create(400, '暱稱長度必須在1到20個字元之間', ErrorCode.VALIDATION_NICKNAME_LENGTH);
  }

  // 數據相關錯誤
  static notFound(resource: string) {
    return this.create(404, `找不到指定的${resource}`, ErrorCode.DATA_NOT_FOUND);
  }

  // 系統錯誤
  static systemError() {
    return this.create(500, '系統發生錯誤', ErrorCode.SYSTEM_ERROR);
  }

  static databaseError() {
    return this.create(500, '數據庫操作失敗', ErrorCode.DATABASE_ERROR);
  }

  static rateLimitExceeded(waitTime?: number) {
    const message = waitTime 
      ? `請求頻率過高，請等待 ${waitTime} 秒後再試` 
      : '請求頻率過高，請稍後再試';
    return this.create(429, message, ErrorCode.RATE_LIMIT_EXCEEDED);
  }

  // 必填錯誤
  static fieldRequired(fieldName: string) {
    return this.create(400, `${fieldName} 為必填欄位`, ErrorCode.DATA_INVALID);
  }

  // 格式錯誤
  static invalidFormat(fieldName: string) {
    return this.create(400, `${fieldName} 格式不正確`, ErrorCode.DATA_INVALID);
  }

  // 僅能編輯草稿
  static badRequest(fieldName: string) {
    return this.create(400, `${fieldName} 僅能編輯草稿中的演唱會`, ErrorCode.DATA_INVALID);
  }
  
  // 不是販售時間
  static outOfTimeRange(fieldName: string) {
    return this.create(400, `${fieldName} 目前非販售時間`, ErrorCode.DATA_INVALID);
  }
  
  // 訂單已過期
  static orderExpired(fieldName: string) {
    return this.create(400, `${fieldName} 訂單已過期`, ErrorCode.DATA_INVALID);
  }

  // 關聯約束違反（外鍵）
  static dataConstraintViolation(message = '資料仍被其他實體關聯，無法刪除') {
    return this.create(400, message, ErrorCode.DATA_CONSTRAINT_VIOLATION);
  }

} 