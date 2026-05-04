#!/bin/bash
# 編輯 TypeScript 檔案後自動執行 ESLint fix

# 從 stdin 讀取 Claude Code 傳入的 JSON（tool use 資訊）
INPUT=$(cat)

# 取得被編輯的檔案路徑
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path":"[^"]*"' | head -1 | sed 's/"file_path":"//;s/"//')

# 只對 .ts 檔案執行
if [[ "$FILE_PATH" == *.ts ]]; then
  cd "$(dirname "$0")/../.." || exit 0
  npx eslint --fix "$FILE_PATH" 2>/dev/null || true
fi
