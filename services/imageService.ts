import { createClient } from '@supabase/supabase-js';
import createHttpError from 'http-errors';

// Supabase 客戶端初始化
const supabaseUrl = process.env.DB_URL;
const supabaseServiceKey = process.env.DB_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('缺少 Supabase 環境變數設定 (DB_URL 或 DB_ANON_KEY)');
}

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * 檢查 URL 是否為暫存圖片
 */
export function isTempUrl(url: string): boolean {
  return url.includes('/temp/');
}

/**
 * 從 URL 提取檔案路徑資訊（支援 temp 和正式 URL）
 */
export function extractPathInfo(imageUrl: string): { bucket: string; filePath: string } {
  try {
    // 解析 Supabase URL 格式
    // 例如：https://xxx.supabase.co/storage/v1/object/public/concert/temp/concert_seating_table/uuid.webp
    const urlParts = imageUrl.split('/storage/v1/object/public/');
    if (urlParts.length !== 2) {
      throw new Error('無效的 Supabase Storage URL 格式');
    }
    
    const pathParts = urlParts[1].split('/');
    const bucket = pathParts[0];
    const filePath = pathParts.slice(1).join('/');
    
    return { bucket, filePath };
  } catch {
    throw createHttpError(400, `無法解析圖片 URL: ${imageUrl}`);
  }
}

/**
 * 驗證圖片 URL 是否實際存在
 * 只接受 Supabase Storage URL，拒絕外部 URL 以確保可靠性
 */
export async function validateImageUrl(imageUrl: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Supabase 環境變數未設定，跳過圖片驗證');
    return true; // 如果環境變數未設定，假設 URL 有效
  }

  try {
    // 如果是 temp URL，直接返回 true（暫存圖片在移動時會自動驗證）
    if (isTempUrl(imageUrl)) {
      return true;
    }

    // 只接受 Supabase URL，拒絕外部 URL
    if (!imageUrl.includes('/storage/v1/object/public/')) {
      console.warn(`拒絕外部圖片 URL: ${imageUrl}`);
      return false; // 直接拒絕外部 URL
    }

    // Supabase URL，檢查檔案是否存在
    const { bucket, filePath } = extractPathInfo(imageUrl);
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (error || !data) {
      console.error('Supabase 圖片驗證失敗:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('驗證圖片 URL 失敗:', error);
    return false;
  }
}

/**
 * 通用的圖片移動功能
 * 從一個路徑移動到另一個路徑
 */
export async function moveImage(fromPath: string, toPath: string, bucket: string): Promise<string> {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase 環境變數未設定');
  }

  try {
    // 1. 下載原圖片
    const { data: imageData, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(fromPath);
    
    if (downloadError) {
      throw createHttpError(404, `無法下載圖片: ${downloadError.message}`);
    }
    
    // 2. 上傳到新位置
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(toPath, imageData, {
        contentType: 'image/webp',
        upsert: true, // 如果檔案已存在則覆蓋
      });
    
    if (uploadError) {
      throw createHttpError(500, `無法上傳到新位置: ${uploadError.message}`);
    }
    
    // 3. 刪除原圖片
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([fromPath]);
    
    if (deleteError) {
      console.warn(`刪除原圖片失敗 (${fromPath}):`, deleteError.message);
      // 不拋出錯誤，因為主要操作已成功
    }
    
    // 4. 生成新的公開 URL
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(toPath);
    
    console.log(`圖片移動成功: ${fromPath} → ${toPath}`);
    
    return publicUrlData.publicUrl;
    
  } catch (error) {
    console.error('移動圖片失敗:', error);
    if (error instanceof Error) {
      throw createHttpError(500, `移動圖片失敗: ${error.message}`);
    }
    throw createHttpError(500, '移動圖片失敗');
  }
}

/**
 * 根據 URL 刪除圖片
 */
export async function deleteImageByUrl(imageUrl: string): Promise<boolean> {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw createHttpError(500, 'Supabase 環境變數未設定');
  }
  
  try {
    const { bucket, filePath } = extractPathInfo(imageUrl);
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);
    
    if (error) {
      console.error('刪除圖片失敗:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('刪除圖片時發生錯誤:', error);
    return false;
  }
}

export default {
  isTempUrl,
  extractPathInfo,
  validateImageUrl,
  moveImage,
  deleteImageByUrl,
}; 