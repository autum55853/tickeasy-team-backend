# CHANGELOG.md

## [未發布]

### 進行中
- 訂單流程整合
- ECPay 綠界金流整合

---

## [0.3.0] - 2025

### 新增
- 演唱會建立支援票種陣列（`ticketTypes`），依草稿狀態決定驗證邏輯
- 演唱會修改限制僅能編輯草稿狀態，並全量重建票種
- 新增 `promotion` 欄位，排序優先為 promotion ASC 再來是 visitCount ASC
- 支援 Query String `take` 參數調整回傳資料數量
- 新增取得特定組織音樂會列表 API，支援分頁、篩選及排序

### 變更
- 演唱會回傳資料結構調整，包含 `concert` 與 `ticketTypes` 兩個物件

---

## [0.2.0] - 2025

### 新增
- 組織 CRUD 完整功能
- 演唱會搜尋（keyword、locationTagId、musicTagId、日期範圍、分頁）
- 演唱會熱門排行與首頁 Banner
- visitCount 計數端點
- 圖片上傳模組（Multer + Sharp + S3 / Supabase Storage）
- 暫存圖片定時清理機制

---

## [0.1.0] - 2025

### 新增
- 專案初始化（TypeScript + Express + TypeORM + Supabase）
- Email 註冊 / 登入
- Email 驗證（6 位數驗證碼，10 分鐘有效）
- 密碼重置流程
- Google OAuth 2.0 登入（雙模式：redirect / JSON）
- JWT 認證 middleware（isAuthenticated / optionalAuth / isAdmin / adminAuth）
- 用戶個人資料查詢 / 更新
- 地區 / 活動類型選項端點
- 統一 API 回應格式與錯誤碼體系
