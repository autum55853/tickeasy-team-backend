---
# 全域規則，不限定路徑
---

# Git Commit 規則

## Commit Message 格式

```
<type>(<scope>): <描述>

[選填 body：說明為什麼這樣改，不是改了什麼]
```

## Type 類型

| Type | 說明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修正 bug |
| `refactor` | 重構（不改功能、不修 bug） |
| `docs` | 文件更新 |
| `test` | 新增或修改測試 |
| `chore` | 建置工具、依賴套件、設定檔更新 |
| `perf` | 效能改善 |
| `style` | 程式碼格式（不影響邏輯） |

## Scope 範例

- `auth`、`concert`、`user`、`organization`、`order`、`payment`、`upload`
- `middleware`、`migration`、`config`

## 範例

```
feat(concert): 新增草稿模式，支援不完整資料儲存

fix(auth): 修正 Google OAuth state 參數 base64 解碼邊界錯誤

refactor(user): 將 gender 轉換邏輯抽出為共用 helper 函式

docs: 更新 FEATURES.md 演唱會模組功能描述

chore: 升級 TypeORM 至 0.3.21
```

## 禁止事項

- 禁止 commit `.env`、`.env.local`、`*.key`、`*.pem` 等機密檔案
- 禁止 `git push --force` 至 main / develop 分支（需透過 PR）
- 禁止使用 `--no-verify` 跳過 pre-commit hook
- Commit message 不需加入 `Co-Authored-By` 標記（除非明確被要求）
