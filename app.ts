import 'reflect-metadata';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

// 另外裝的
import dotenv from 'dotenv';
dotenv.config();
import helmet from 'helmet';
import cors from 'cors';

// 確保模型初始化
import './models/index.js';

import path from 'path';
import { fileURLToPath } from 'url';


// 引入路由
import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';
import organizationRouter from './routes/organization.js';
import uploadRouter from './routes/upload.js';
import concertRoute from './routes/concert.js';
import ticketRoute from './routes/ticket.js';
import ordersRoute from './routes/orders.js';
import paymentRoute from './routes/payment.js';
import sessionRoute from './routes/session.js';
import knowledgeBaseRoute from './routes/knowledge-base.js';
import smartReplyRoute from './routes/smart-reply.js';


import healthRouter from './routes/health.js';

const app = express();

// 未捕獲的異常處理（測試環境不 exit，避免殺死 Jest worker）
process.on('uncaughtException', (err) => {
  console.error('未捕獲的異常:', err);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
});

// 未處理的 Promise 拒絕處理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未處理的 Promise 拒絕:', promise, '原因:', reason);
});

// ESM friendly __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定 View 引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


// 中間件設置
app.use(helmet());

// CORS 配置
const corsOptions = {
   
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // 允許的來源
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',  // Vite 開發服務器
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'https://tickeasy-dashboard.onrender.com',
      'https://frontend-fz4o.onrender.com',
      'https://frontend-amber.onrender.com',
      'https://tickeasy-frontend.onrender.com',
      'https://tickeasy-f.onrender.com'
    ];
    
    // 從 FRONTEND_URL 環境變數中提取前端域名（去掉 /callback）
    if (process.env.FRONTEND_URL) {
      const frontendUrl = process.env.FRONTEND_URL.replace('/callback', '');
      allowedOrigins.push(frontendUrl);
    }
    
    // 開發環境允許沒有 origin 的請求（例如 Postman、移動應用）
    if (process.env.NODE_ENV === 'development' && !origin) {
      return callback(null, true);
    }
    
    
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`來源 ${origin} 不被 CORS 政策允許`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-HTTP-Method-Override',
    'Access-Control-Allow-Headers'
  ],
  credentials: true,
  optionsSuccessStatus: 200 // 支援舊版 IE
};

app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


// 路由設置
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ status: 'success', message: 'OK' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/organizations', organizationRouter);
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/concerts', concertRoute);
app.use('/api/v1/ticket', ticketRoute);
app.use('/api/v1/orders', ordersRoute);
app.use('/api/v1/payments', paymentRoute);
app.use('/api/v1/sessions', sessionRoute);
app.use('/api/v1/knowledge-base', knowledgeBaseRoute);
app.use('/api/v1/smart-reply', smartReplyRoute);

app.use('/api/v1/health', healthRouter);


// 註冊錯誤處理中間件
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('錯誤詳情:', err);
  
  // 開發環境顯示詳細錯誤信息，生產環境顯示友好錯誤信息
  const isDev = process.env.NODE_ENV === 'development';
  
  const statusCode = err.status || 500;
  
  // 處理特定類型的錯誤，提供友好的錯誤消息
  let message = err.message || '系統發生錯誤';
  
  // 從錯誤對象中獲取錯誤碼，如果沒有則根據錯誤類型分配一個通用錯誤碼
  let errorCode = err.code || '';
  
  // 如果沒有指定錯誤碼，則根據錯誤類型分配
  if (!errorCode) {
    if (err.name === 'EntityPropertyNotFoundError') {
      errorCode = 'S02'; // 使用DATABASE_ERROR的值
      message = '操作失敗，請稍後再試';
    } else if (err.name === 'ValidationError') {
      errorCode = 'V01'; // 使用VALIDATION_FAILED的值
      message = '提交的數據格式不正確';
    } else if (statusCode === 404) {
      errorCode = 'D01'; // 使用DATA_NOT_FOUND的值
    } else if (statusCode === 401) {
      errorCode = 'A06'; // 使用AUTH_UNAUTHORIZED的值
    } else if (statusCode === 403) {
      errorCode = 'A07'; // 使用AUTH_FORBIDDEN的值
    } else if (statusCode === 429) {
      errorCode = 'S03'; // 使用RATE_LIMIT_EXCEEDED的值
    } else if (statusCode >= 400 && statusCode < 500) {
      errorCode = 'V01'; // 使用VALIDATION_FAILED的值
    } else {
      errorCode = 'S01'; // 使用SYSTEM_ERROR的值
    }
  }
  
  // 構建錯誤響應
  const errorResponse: any = {
    status: 'failed',
    message,
  };
  
  // // 添加字段錯誤（如果有）
  // if (err.fieldErrors) {
  //   errorResponse.fieldErrors = err.fieldErrors;
  // }
  
  // 只在開發環境下添加詳細錯誤信息
  if (isDev) {
    errorResponse.details = err.stack;
  }
  
  // 如果 headers 已經發送，則將錯誤交給 Express 的預設錯誤處理器
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(statusCode).json(errorResponse);
});

// 註冊 404 處理中間件

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(next);
  res.status(404).json({
    status: 'failed',
    message: '找不到該資源',
  });
});

// view engine setup 之後研究
// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'jade');

export default app;
