import imageService from './imageService.js';
import { ApiError } from '../utils/index.js';

/**
 * Concert 專用的路徑生成函數
 */
function getConcertBannerPath(concertId: string): string {
  return `concerts/${concertId}/banner.webp`;
}

function getConcertSeatingTablePath(sessionId: string): string {
  return `sessions/${sessionId}/seattable.webp`;
}

/**
 * 處理音樂會橫幅圖片
 * 如果是暫存圖片則移動到正式位置，否則驗證 URL 有效性
 */
export async function processConcertBanner(
  imgBanner: string, 
  concertId: string, 
  concertTitle?: string
): Promise<string> {
  if (!imgBanner) return imgBanner;
  
  const concertInfo = concertTitle ? `演唱會「${concertTitle}」(${concertId})` : `演唱會 ${concertId}`;
  
  if (imageService.isTempUrl(imgBanner)) {
    try {
      // 解析暫存圖片路徑
      const { bucket, filePath: tempPath } = imageService.extractPathInfo(imgBanner);
      
      // 生成正式路徑
      const officialPath = getConcertBannerPath(concertId);
      
      // 移動圖片
      const newUrl = await imageService.moveImage(tempPath, officialPath, bucket);
      
      console.log(`${concertInfo} 的橫幅圖片已移動到正式位置: ${newUrl}`);
      return newUrl;
    } catch (error) {
      console.error(`移動 ${concertInfo} 的橫幅圖片失敗:`, error);
      
             // 根據錯誤類型提供更具體的錯誤訊息
       if (error instanceof Error) {
         if (error.message.includes('無法解析圖片 URL')) {
           throw ApiError.invalidFormat(`${concertInfo} 的橫幅圖片 URL：${imgBanner}`);
         } else if (error.message.includes('無法下載圖片')) {
           throw ApiError.notFound(`${concertInfo} 的暫存橫幅圖片，請重新上傳`);
         } else if (error.message.includes('無法上傳到新位置')) {
           throw ApiError.systemError();
         } else if (error.message.includes('Supabase 環境變數未設定')) {
           throw ApiError.systemError();
         }
       }
       
       throw ApiError.systemError();
    }
  } else {
    // 驗證非 temp URL
    try {
      const isValidUrl = await imageService.validateImageUrl(imgBanner);
      if (!isValidUrl) {
        throw ApiError.invalidFormat(`${concertInfo} 的橫幅圖片 URL：${imgBanner}`);
      }
      console.log(`${concertInfo} 的橫幅圖片 URL 驗證通過: ${imgBanner}`);
      return imgBanner;
    } catch (error) {
      console.error(`驗證 ${concertInfo} 的橫幅圖片 URL 失敗:`, error);
      
      if (error instanceof ApiError) {
        throw error; // 重新拋出已經格式化的錯誤
      }
      
      throw ApiError.invalidFormat(`${concertInfo} 的橫幅圖片`);
    }
  }
}

/**
 * 處理座位表圖片
 * 如果是暫存圖片則移動到正式位置，否則驗證 URL 有效性
 */
export async function processConcertSeatingTable(
  imgSeattable: string, 
  sessionId: string, 
  sessionTitle?: string
): Promise<string> {
  if (!imgSeattable) return imgSeattable;
  
  const sessionInfo = sessionTitle ? `場次「${sessionTitle}」(${sessionId})` : `場次 ${sessionId}`;
  
  if (imageService.isTempUrl(imgSeattable)) {
    try {
      // 解析暫存圖片路徑
      const { bucket, filePath: tempPath } = imageService.extractPathInfo(imgSeattable);
      
      // 生成正式路徑
      const officialPath = getConcertSeatingTablePath(sessionId);
      
      // 移動圖片
      const newUrl = await imageService.moveImage(tempPath, officialPath, bucket);
      
      console.log(`${sessionInfo} 的座位表圖片已移動到正式位置: ${newUrl}`);
      return newUrl;
    } catch (error) {
      console.error(`移動 ${sessionInfo} 的座位表圖片失敗:`, error);
      
             // 根據錯誤類型提供更具體的錯誤訊息
       if (error instanceof Error) {
         if (error.message.includes('無法解析圖片 URL')) {
           throw ApiError.invalidFormat(`${sessionInfo} 的座位表圖片 URL：${imgSeattable}`);
         } else if (error.message.includes('無法下載圖片')) {
           throw ApiError.notFound(`${sessionInfo} 的暫存座位表圖片，請重新上傳`);
         } else if (error.message.includes('無法上傳到新位置')) {
           throw ApiError.systemError();
         } else if (error.message.includes('Supabase 環境變數未設定')) {
           throw ApiError.systemError();
         }
       }
       
       throw ApiError.systemError();
    }
  } else {
    // 驗證非 temp URL
    try {
      const isValidUrl = await imageService.validateImageUrl(imgSeattable);
      if (!isValidUrl) {
        throw ApiError.invalidFormat(`${sessionInfo} 的座位表圖片 URL：${imgSeattable}`);
      }
      console.log(`${sessionInfo} 的座位表圖片 URL 驗證通過: ${imgSeattable}`);
      return imgSeattable;
    } catch (error) {
      console.error(`驗證 ${sessionInfo} 的座位表圖片 URL 失敗:`, error);
      
      if (error instanceof ApiError) {
        throw error; // 重新拋出已經格式化的錯誤
      }
      
      throw ApiError.invalidFormat(`${sessionInfo} 的座位表圖片`);
    }
  }
}

/**
 * 更新音樂會橫幅圖片（包含刪除舊圖片）
 * 處理新圖片並刪除舊圖片
 */
export async function updateConcertBanner(
  newImgBanner: string, 
  oldImgBanner: string, 
  concertId: string
): Promise<string> {
  if (!newImgBanner || newImgBanner === oldImgBanner) {
    return newImgBanner;
  }
  
  // 處理新圖片
  const processedUrl = await processConcertBanner(newImgBanner, concertId);
  
  // 刪除舊圖片（如果不是 temp 圖片）
  if (oldImgBanner && !imageService.isTempUrl(oldImgBanner)) {
    try {
      await imageService.deleteImageByUrl(oldImgBanner);
      console.log(`舊音樂會橫幅已刪除: ${oldImgBanner}`);
    } catch (error) {
      console.warn('刪除舊音樂會橫幅失敗:', error);
      // 不拋出錯誤，因為主要操作是更新
    }
  }
  
  return processedUrl;
}

/**
 * 批次處理場次的座位表圖片
 */
export async function batchProcessSeatingTables(
  sessions: Array<{ imgSeattable: string; sessionId: string }>
): Promise<Array<{ sessionId: string; processedUrl: string }>> {
  const results = [];
  
  for (const session of sessions) {
    try {
      const processedUrl = await processConcertSeatingTable(session.imgSeattable, session.sessionId);
      results.push({
        sessionId: session.sessionId,
        processedUrl
      });
    } catch (error) {
      console.error(`處理場次 ${session.sessionId} 的座位表失敗:`, error);
      throw error;
    }
  }
  
  return results;
}

export default {
  processConcertBanner,
  processConcertSeatingTable,
  updateConcertBanner,
  batchProcessSeatingTables,
}; 