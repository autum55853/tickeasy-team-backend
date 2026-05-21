import { AppDataSource } from '../../config/database.js';

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    try {
      await AppDataSource.initialize();
    } catch (err: any) {
      if (!AppDataSource.isInitialized) {
        throw err;
      }
    }
  }
}, 60000);

// 不在每個 suite 結束時 destroy，連線清理由 jest forceExit 處理
