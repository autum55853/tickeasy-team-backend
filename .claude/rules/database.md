---
paths:
  - "models/**"
  - "migrations/**"
  - "config/database.ts"
---

# 資料庫規則

## TypeORM 基本規範

- **絕對禁止** `synchronize: true`，schema 變更必須透過 migration
- Entity class 使用 PascalCase，DB table 名稱在 `@Entity('table_name')` 中用 snake_case 指定
- UUID 主鍵統一使用 `@PrimaryGeneratedColumn('uuid')`
- 時間戳欄位使用 `@CreateDateColumn` / `@UpdateDateColumn` 自動管理

## 命名規則

| 類別 | 規則 | 範例 |
|------|------|------|
| 檔案名稱 | kebab-case | `ticket-type.ts` |
| Entity class | PascalCase | `TicketType` |
| DB table | snake_case（在 @Entity 指定） | `ticket_type` |
| DB 欄位 | camelCase（TypeORM 自動映射） | `userId`, `orgName` |

## 關聯定義

- `@ManyToOne` 端加 `@JoinColumn({ name: 'foreignKeyColumn' })` 指定 FK 欄位名稱
- `@OneToMany` 端使用 `lazy: true` 或在需要時明確 join，避免預設 eager 載入造成效能問題
- 刪除行為（`onDelete`）必須明確設定：`CASCADE`、`SET NULL`、`RESTRICT`

## Migration 流程

```bash
# 1. 建立 migration（自動比對 entity 差異）
npm run typeorm migration:generate -- -d config/database.ts -n <MigrationName>

# 2. 確認 migration 內容正確後執行
npm run migrate

# 3. 若需回滾
npm run typeorm migration:revert -- -d config/database.ts
```

- Migration 檔案命名採時間戳前綴，由工具自動產生，不手動修改檔名
- 新增 entity 後確認 `config/database.ts` 的 `entities` glob（`models/*.{ts,js}`）能掃描到

## Enum 欄位

- DB 儲存英文 enum 值，API 若需回傳中文則在 controller 層轉換（參考 gender 欄位的 `toChineseGender` / `toEnglishGender`）
- Enum 值統一用 UPPER_SNAKE_CASE：`UserRole.ADMIN`、`OrderStatus.PAID`

## 查詢規範

- 複雜查詢優先使用 QueryBuilder，避免多層 `find({ relations: [...] })` 造成 N+1
- 分頁查詢使用 `skip` / `take`，不使用 `offset` / `limit`
- 敏感欄位（password、verificationToken）查詢時必須明確 `addSelect`，Entity 定義應加 `{ select: false }`
