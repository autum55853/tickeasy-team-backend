import express, { Router } from 'express';
import { Buffer } from 'buffer';
import {
  register,
  login,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
  googleLogin
} from '../controllers/auth.js';
import passport from '../config/passport.js';
import { isAuthenticated } from '../middlewares/auth.js';
import { changePassword } from '../controllers/auth.js';

const router: Router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
// google login
// router.get('/google', googleLogin); // Passport 會處理重定向 (舊的)
// router.get('/google/callback', googleLogin); // 處理 Google 回調 (舊的)
router.get('/google', (req, res, next) => {
  // 擷取您想從 /google 路由傳遞到 /google/callback 路由的查詢參數
  const queryParamsToPass: { [key: string]: any } = {};
  for (const key in req.query) {
    if (Object.prototype.hasOwnProperty.call(req.query, key)) {
      // 您可以在此處過濾掉不想傳遞的參數
      // 例如， 'scope', 'response_type', 'redirect_uri', 'client_id' 等 OAuth 標準參數
      // 此範例傳遞所有非標準 OAuth 參數
      queryParamsToPass[key] = req.query[key];
    }
  }

  let stateString: string | undefined = undefined;
  if (Object.keys(queryParamsToPass).length > 0) {
    try {
      const jsonString = JSON.stringify(queryParamsToPass);
      stateString = Buffer.from(jsonString).toString('base64');
    } catch (error) {
      console.error('無法序列化查詢參數到 state:', error);
      // 根據您的錯誤處理策略處理錯誤
      // 例如，可以呼叫 next(error) 或不設置 state 繼續，但這可能導致數據丟失
    }
  }

  const authOptions: passport.AuthenticateOptions = {
    scope: ['profile', 'email'],
  };

  if (stateString) {
    authOptions.state = stateString;
  }

  passport.authenticate('google', authOptions)(req, res, next);
}); // 觸發 Google 登入並傳遞 state

router.get('/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: process.env.FRONTEND_LOGIN_FAIL_URL || '/login/failed', // 登入失敗跳轉的 URL
    session: false // 不使用 session
  }), 
  googleLogin // Passport 驗證成功後執行此控制器
);

// 已登入用戶變更密碼
router.post('/change-password', isAuthenticated, changePassword);

export default router; 