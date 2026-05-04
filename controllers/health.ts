import { Request, Response, NextFunction } from 'express';
import storageService from '../services/storage-supabase.js';

// 記錄上次清理時間
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = (parseInt(process.env.CLEANUP_INTERVAL_HOURS || '6') * 60 * 60 * 1000); // 預設6小時（毫秒）
const CLEANUP_HOURS = parseInt(process.env.CLEANUP_TEMP_IMAGES_HOURS || '24'); // 預設清理24小時前的圖片

/**
 * 保活端點（機器人呼叫用）
 * 每次呼叫時檢查是否需要清理暫存圖片
 */
export const keepAlive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = Date.now();
    let cleanupResult = null;
    
    // 檢查是否需要執行清理（根據環境變數設定的間隔）
    if (now - lastCleanupTime > CLEANUP_INTERVAL) {
      try {
        console.log(`開始自動清理 ${CLEANUP_HOURS} 小時前的暫存圖片...`);
        const deletedCount = await storageService.cleanupTempImages(CLEANUP_HOURS);
        cleanupResult = {
          executed: true,
          deletedCount,
          timestamp: new Date().toISOString()
        };
        lastCleanupTime = now;
        console.log(`自動清理完成，共刪除 ${deletedCount} 個暫存圖片`);
      } catch (cleanupError) {
        console.error('自動清理暫存圖片失敗:', cleanupError);
        cleanupResult = {
          executed: true,
          error: '清理失敗',
          timestamp: new Date().toISOString()
        };
      }
    }

    res.status(200).json({
      status: 'success',
      message: '服務保活成功',
      data: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        lastCleanupTime: lastCleanupTime ? new Date(lastCleanupTime).toISOString() : null,
        nextCleanupIn: Math.max(0, CLEANUP_INTERVAL - (now - lastCleanupTime)),
        cleanup: cleanupResult
      }
    });
  } catch (err) {
    next(err);
  }
};

export default {
  keepAlive
}; 