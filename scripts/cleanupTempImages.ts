/**
 * 清理暫存圖片腳本
 * 
 * 此腳本用於清理超過一定時間的暫存圖片
 * 可使用 cron 排程定期執行，例如：
 * 0 1 * * * node dist/scripts/cleanupTempImages.js
 * （每天凌晨 1 點執行）
 */

import 'dotenv/config';
import storageService from '../services/storage-supabase';

// 預設清理 24 小時前的暫存圖片
const HOURS = process.env.CLEANUP_TEMP_IMAGES_HOURS 
  ? parseInt(process.env.CLEANUP_TEMP_IMAGES_HOURS) 
  : 24;

async function main() {
  console.log(`開始清理 ${HOURS} 小時前的暫存圖片...`);
  
  try {
    const deletedCount = await storageService.cleanupTempImages(HOURS);
    console.log(`清理完成，共刪除 ${deletedCount} 個暫存圖片`);
  } catch (error) {
    console.error('清理暫存圖片失敗:', error);
    process.exit(1);
  }
}

// 執行主程式
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('未預期的錯誤:', err);
    process.exit(1);
  }); 