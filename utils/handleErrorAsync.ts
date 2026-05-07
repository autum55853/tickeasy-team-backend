import { Request, Response, NextFunction } from 'express';

/**
 * 非同步路由處理器類型
 */
 
export type AsyncRequestHandler = (
  req: Request, 
  res: Response, 
  next: NextFunction
) => Promise<any>;
 

/**
 * 異步錯誤處理包裝器
 * 用於捕獲異步路由處理函數中拋出的錯誤
 * @param fn 異步函數
 * @returns 包裝後的異步函數
 */
export const handleErrorAsync = (fn: AsyncRequestHandler): AsyncRequestHandler => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      return await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}; 