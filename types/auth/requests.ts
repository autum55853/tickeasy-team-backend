/**
 * 認證相關請求類型定義
 */

import { UserRole, Gender } from '../../models/user.js';

// 用戶註冊請求
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  nickname?: string;
  phone?: string;
  birthday?: Date | string;
}

// 用戶登入請求
export interface LoginRequest {
  email: string;
  password: string;
}

// 電子郵件驗證請求
export interface VerifyEmailRequest {
  email: string;
  code: string;
}

// 重新發送驗證請求
export interface ResendVerificationRequest {
  email: string;
}

// 密碼重置請求
export interface RequestPasswordResetRequest {
  email: string;
}

// 執行密碼重置請求
export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

// 已登入用戶變更密碼請求
export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

// Google 登入請求的用戶格式
export interface GoogleUserData {
  userId: string;
  name: string;
  email: string;
  photo?: string;
  role?: UserRole;
  oauthProviders?: string[];
  phone?: string;
  address?: string;
  birthday?: string;
  gender?: Gender | string;
  intro?: string;
  facebook?: string;
  instagram?: string;
  discord?: string;
}

// 擴展 Express 請求以包含 Google 用戶
export interface GoogleRequestUser {
  userId: string;
  user: GoogleUserData;
} 