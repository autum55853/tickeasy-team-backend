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
}, 30000);

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
