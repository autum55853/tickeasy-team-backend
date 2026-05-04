/**
 * API 相關型別定義
 */

// import { HttpError } from 'http-errors';

/**
 * API 標準響應結構
 */
export interface ApiResponse<T = any> {
  status: 'success' | 'failed';
  message: string;
  data?: T;
}

/**
 * 分頁響應結構
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * 通用錯誤響應
 */
export interface ErrorResponse {
  status: 'failed';
  message: string;
  details?: any;
  code?: string;
}

/**
 * 常用 HTTP 狀態碼
 */
/** 
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500
}
*/

/**
 * 錯誤碼定義
 * 分類格式：XYZ
 * X: 錯誤類型（A=身份認證, V=數據驗證, D=資料, S=系統）
 * YZ: 序號
 */

/* eslint-disable no-unused-vars */
export enum ErrorCode {
  // 身份認證與授權相關錯誤 (A)
  AUTH_EMAIL_REQUIRED = 'A01',
  AUTH_PASSWORD_REQUIRED = 'A02',
  AUTH_NAME_REQUIRED = 'A03',
  AUTH_EMAIL_EXISTS = 'A04',
  AUTH_INVALID_CREDENTIALS = 'A05',
  AUTH_UNAUTHORIZED = 'A06',
  AUTH_FORBIDDEN = 'A07',
  AUTH_TOKEN_EXPIRED = 'A08',
  AUTH_TOKEN_INVALID = 'A09',
  AUTH_INSUFFICIENT_PERMISSION = 'A10',
  AUTH_EMAIL_NOT_VERIFIED = 'A11',
  AUTH_INVALID_OLD_PASSWORD = 'A12',
  
  // 數據驗證錯誤 (V)
  VALIDATION_FAILED = 'V01',
  VALIDATION_EMAIL_FORMAT = 'V02',
  VALIDATION_PASSWORD_FORMAT = 'V03',
  VALIDATION_NAME_LENGTH = 'V04',
  VALIDATION_NICKNAME_LENGTH = 'V05',
  VALIDATION_EMAIL_LENGTH = 'V06',
  INVALID_QR_FORMAT = 'V07',
  INVALID_UUID_FORMAT = 'V08',
  TOO_EARLY_TO_VERIFY = 'V09',
  TOO_LATE_TO_VERIFY = 'V10',
  
  // 數據相關錯誤 (D)
  DATA_NOT_FOUND = 'D01',
  DATA_ALREADY_EXISTS = 'D02',
  DATA_INVALID = 'D03',
  ORDER_NOT_FOUND = 'D04',
  INVALID_ORDER_STATUS = 'D05',
  TICKET_NOT_FOUND = 'D06',
  TICKET_ALREADY_USED = 'D07',
  TICKET_REFUNDED = 'D08',
  INVALID_TICKET_STATUS = 'D09',
  DATA_CONSTRAINT_VIOLATION = 'D10',
  
  // 系統錯誤 (S)
  SYSTEM_ERROR = 'S01',
  DATABASE_ERROR = 'S02',
  RATE_LIMIT_EXCEEDED = 'S03',
  
  // 未知錯誤
  UNKNOWN_ERROR = 'U01'
}

/**
 * 擴展錯誤響應，支持字段級別的錯誤
 */
export interface DetailedErrorResponse extends ErrorResponse {
  code: string;
  fieldErrors?: {
    [field: string]: {
      code: string;
      message: string;
    }
  }
} 