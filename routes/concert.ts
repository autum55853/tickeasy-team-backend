import express from 'express';
import * as concertController from '../controllers/concert.js';
import { isAuthenticated } from '../middlewares/auth.js';

const router = express.Router();

// 新增活動
router.post('/', isAuthenticated, concertController.createConcert);

// 修改活動（僅限草稿）
router.put('/:concertId', isAuthenticated, concertController.updateConcert);

// 提交演唱會審核
router.put(
  '/:concertId/submit',
  isAuthenticated,
  concertController.submitConcertForReview
);

// // 取消活動
// router.delete(
//     '/:concertId/cancel',
//     isAuthenticated,
//     concertController.deleteConcert
// );

// 確認活動名稱是否重複
router.get(
  '/check-title',
  // isAuthenticated,
  concertController.checkConcertTitleExists
);

// 軟刪除活動
router.patch(
  '/:concertId/cancel',
  isAuthenticated,
  concertController.softDeleteConcert
);


// 複製活動
router.post(
  '/:concertId/duplicate',
  isAuthenticated,
  concertController.duplicateConcert
);

// 增加visitCount
router.patch('/:concertId/visit', concertController.incrementVisitCount);

// 設定promotion權重
//(暫時沒有做驗證)
router.patch('/:concertId/promotion', concertController.updatePromotion);

// 獲得熱門演唱會
router.get('/popular', concertController.getPopularConcerts);

// 獲得場地
router.get('/venues', concertController.getAllVenues);

// 搜尋
router.get('/search', concertController.searchConcerts);

// 獲得首頁promo的banner
router.get('/banners', concertController.getBannerConcerts);

// 獲得location tags
router.get('/location-tags', concertController.getLocationTags);

// 獲得music tags
router.get('/music-tags', concertController.getMusicTags);

// 獲取演唱會審核記錄
router.get(
  '/:concertId/reviews',
  isAuthenticated,
  concertController.getConcertReviews
);

// 手動審核演唱會 (管理員)
router.post(
  '/:concertId/manual-review',
  isAuthenticated, // TODO: 應更換為 isAdmin 中介軟體
  concertController.submitManualConcertReview
);

// 取得指定演唱會的所有場次及票種
router.get('/:concertId/sessions', concertController.getConcertSessions);

// 單一演唱會資訊
router.get('/:concertId', concertController.getConcertById);

export default router;
