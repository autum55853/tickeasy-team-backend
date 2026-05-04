/**
 * 用戶相關請求類型定義
 */

// import { Gender } from '../../models/user.js';

/**
 * 更新用戶資料請求
 */
export interface UpdateProfileRequest {
  name?: string;
  nickname?: string;
  phone?: string;
  birthday?: Date | string | null;
  gender?: string | null;
  address?: string;
  country?: string;
  preferredRegions?: string[];
  preferredEventTypes?: string[];
}

/**
 * 更新使用者角色請求
 */
export interface UpdateUserRoleRequest {
  /** 目標角色，可為 user、admin、superuser */
  role: 'user' | 'admin' | 'superuser';
} 