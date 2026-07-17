/**
 * INDEX
 *
 * 本檔案已於 2026-07-17 拆分為 controllers/concert/ 下的領域子模組，
 * 此檔案現為 barrel re-export，保留原路徑供 routes/concert.ts 引用。
 *
 * 1. 建立活動                         -> concert/crud.ts
 * 2. 修改活動                         -> concert/crud.ts
 * 3. 獲得場地的資料                    -> concert/venue.ts
 * 3b. 更新場地資料                     -> concert/venue.ts
 * 3c. 新增場地                        -> concert/venue.ts
 * 3d. 刪除場地（軟刪除）                -> concert/venue.ts
 * 4. 取得熱門活動                      -> concert/discovery.ts
 * 5. 增加visitCount                  -> concert/discovery.ts
 * 6. 設定promotion權重                -> concert/discovery.ts
 * 7. 搜尋活動                         -> concert/discovery.ts
 * 8. 獲得首頁promo的banner             -> concert/discovery.ts
 * 9. 提交演唱會審核                    -> concert/review.ts
 * 10. 獲得演唱會詳細資料                -> concert/crud.ts
 * 11. 獲得location tags              -> concert/reference.ts
 * 12. 獲得music tags                 -> concert/reference.ts
 * 13. 軟刪除演唱會                     -> concert/crud.ts
 * 14. 複製演唱會                      -> concert/crud.ts
 * 15. 檢查演唱會名字是否重複             -> concert/crud.ts
 * 16. 獲取演唱會審核記錄                -> concert/review.ts
 * 17. 取得指定演唱會的所有場次及票種       -> concert/session.ts
 * 18. 手動審核演唱會                   -> concert/review.ts
 */

export * from './concert/crud.js';
export * from './concert/discovery.js';
export * from './concert/review.js';
export * from './concert/venue.js';
export * from './concert/reference.js';
export * from './concert/session.js';
