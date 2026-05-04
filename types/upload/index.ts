import { Buffer } from 'buffer';

/**
 * 定義上傳內容的上下文類型
 * 表示上傳的圖片將用於什麼目的/位置
 */
export type UploadContext = 
  | 'USER_AVATAR'     // 使用者頭像
  | 'VENUE_PHOTO'     // 場地照片
  | 'CONCERT_SEATING_TABLE'  // 音樂會座位表
  | 'CONCERT_BANNER'  // 音樂會橫幅

/**
 * 臨時檔案目錄名稱
 */
export const TEMP_DIRECTORY = 'temp';

/**
 * 上傳圖片服務的參數介面
 */
export interface UploadImageParams {
  fileBuffer: Buffer;       // 檔案緩衝區
  originalName: string;     // 原始檔案名稱
  mimetype: string;         // 檔案MIME類型
  uploadContext: UploadContext; // 上傳上下文
  targetId?: string | number;    // 目標ID (使用者ID, 音樂會ID等)，暫存模式下可為空
  userId?: string | number;     // 上傳者ID (可選，用於權限驗證)
  isTemporary?: boolean;    // 是否為臨時檔案
  options?: {
    maxWidth?: number;      // 最大寬度 (像素)
    maxHeight?: number;     // 最大高度 (像素)
    quality?: number;       // 品質 (1-100)
    format?: 'webp' | 'jpeg' | 'png'; // 輸出格式
  };
}

/**
 * 上傳圖片的結果介面
 */
export interface UploadImageResult {
  url: string;   // 圖片的公開URL
  path: string;  // Supabase Storage中的路徑
  width?: number; // 圖片寬度 (如果有處理)
  height?: number; // 圖片高度 (如果有處理)
  size?: number;   // 檔案大小 (位元組)
  format?: string; // 檔案格式
  isTemporary?: boolean; // 是否為臨時檔案
}

/**
 * 刪除圖片的參數介面
 */
export interface DeleteImageParams {
  path: string;              // Supabase Storage中的路徑
  userId?: string | number;  // 要求刪除的使用者ID (用於權限驗證)
}
