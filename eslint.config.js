// 導入必要的模組
import globals from "globals"; // 用於處理全域變數
// 推薦使用這種方式導入 typescript-eslint 的組件
import tseslint from 'typescript-eslint';
import js from '@eslint/js'; // 用於 ESLint 內建的推薦 JS 規則

export default [
  // 1. 設定要忽略的檔案和目錄
  // 這是非常重要的，特別是當你執行 `eslint .` 時
  {
    ignores: [
      "node_modules/", // 忽略 node_modules 目錄
      "dist/",         // 忽略 dist 目錄 (編譯後的檔案)
      // 如果還有其他你不想檢查的目錄或檔案，也加在這裡
      // 例如: "build/", "coverage/", "*.spec.js" (如果你的測試檔案是編譯後的 js)
    ],
  },

  // 2. 載入 ESLint 內建的推薦 JS 規則
  // 這些是通用的最佳實踐規則
  js.configs.recommended,

  // 3. 針對 TypeScript 檔案 (.ts) 的專門配置
  {
    // 這個配置物件只會應用於符合這個 patterns 的檔案
    files: ['**/*.ts'], // 應用於所有 .ts 檔案 (包括根目錄下的)

    languageOptions: {
      // 使用 TypeScript 解析器來理解 TS 語法
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest', // 指定 ECMAScript 版本
        sourceType: 'module', // 指定模組類型
        project: './tsconfig.eslint.json', // 指定 tsconfig.json 路徑，用於啟用需要類型資訊的規則
        // 其他解析器選項，如果需要
      },
      // 定義你的程式碼運行環境中的全域變數
      globals: {
         // 載入 Node.js 環境的所有全域變數 (包括 process, console 等)
         ...globals.node,
         // 如果還有其他環境的全局變數 (例如用於測試框架 Jest)，可以在這裡添加
         // ...globals.jest,  // 測試 globals 由下方 tests/** 配置區塊處理
      },
    },

    // 註冊 TypeScript ESLint 插件
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },

    // 啟用規則
    rules: {
      // 載入 @typescript-eslint 插件的推薦規則集
      // 這些規則會針對 TypeScript 語法提供額外的檢查或覆蓋 ESLint 內建的規則
      ...tseslint.configs.recommended.rules,
      // 你可以在這裡加入或覆蓋更多的規則
      // 例如，你的原始規則:
      'no-unused-vars': 'off', // 關閉 ESLint 內建版本，避免與 @typescript-eslint 版本衝突
      '@typescript-eslint/no-unused-vars': ['warn'], // 保留未使用的變數為警告
      'quotes': ['error', 'single', { avoidEscape: true }], // 單引號，允許為了避免轉義而使用雙引號
      'semi': ['error', 'always'], // 強制使用分號

      // 更多你可能需要的規則 (範例):
      // '@typescript-eslint/explicit-function-return-type': 'warn', // 強制函數有明確的返回值類型
      // 'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off', // 允許在開發環境使用 console，在生產環境給警告
      // '@typescript-eslint/no-explicit-any': 'warn', // 限制使用 any 類型
    },
  },

  // 4. 如果你需要針對其他類型檔案 (例如 .js) 或特定目錄有不同的配置，可以在這裡添加更多的配置物件
  // {
  //   files: ["**/*.js"], // 例如，對所有 .js 檔案應用不同的規則
  //   rules: {
  //     // ... .js 檔案的規則
  //   }
  // }

  // 5. 測試檔案（tests/ 目錄）加入 Jest 全域變數，使 beforeAll / afterAll 等可被識別
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];