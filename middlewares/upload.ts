import multer from 'multer';
import { Request, Response, Express } from 'express';
import createHttpError from 'http-errors';

// 配置內存儲存
const storage = multer.memoryStorage();

// 檔案大小限制 (1MB)
const MAX_FILE_SIZE = 1 * 1024 * 1024;

// 檔案過濾器
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // 只允許圖片檔案類型
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(createHttpError(400, '不支援的檔案類型，僅接受 JPEG, PNG, GIF 或 WebP 格式'));
  }
};

// 創建 multer 實例
export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter
}).fields([
  { name: 'file', maxCount: 1 }
]);

// 處理 multer 錯誤
export const handleMulterError = (err: any, req: Request, res: Response, next: Function) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(createHttpError(400, `檔案大小超過限制 (最大 ${MAX_FILE_SIZE / (1024 * 1024)}MB)`));
    }
    return next(createHttpError(400, `檔案上傳錯誤: ${err.message}`));
  }
  next(err);
}; 