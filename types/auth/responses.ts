/**
 * 認證相關響應類型定義
 */

import { UserRole, Gender, OAuthProvider } from '../../models/user.js';

// 基本用戶數據
export interface UserData {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
  nickname?: string;
  phone?: string;
  birthday?: Date | string | null;
  gender?: Gender | null;
  avatar?: string;
  isEmailVerified: boolean;
  oauthProviders?: OAuthProvider[];
  address?: string;
}

// 認證響應數據
export interface AuthResponseData {
  token: string;
  user: UserData;
}

// 驗證響應數據
export interface VerificationResponseData {
  isEmailVerified: boolean;
}

// Google 用戶數據響應
export interface GoogleUserResponseData extends Omit<UserData, 'gender' | 'oauthProviders'> {
  photo?: string;
  oauthProviders?: OAuthProvider[];
  address?: string;
  gender?: Gender | string; // 允許 Gender 或 string 類型
  intro?: string;
  facebook?: string;
  instagram?: string;
  discord?: string;
} 