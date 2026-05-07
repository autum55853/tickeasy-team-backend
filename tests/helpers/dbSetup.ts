import { AppDataSource } from '../../config/database.js';

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    try {
      await AppDataSource.initialize();
    } catch (err: any) {
      // app.ts 可能已在背景初始化，「already initialized」可安全忽略
      if (!AppDataSource.isInitialized) {
        throw err;
      }
    }
  }
}, 60000); // Supabase 免費方案冷啟動可能需 30-60 秒

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
