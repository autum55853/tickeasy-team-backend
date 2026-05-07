FROM node:18-alpine

WORKDIR /app

# 複製 package.json 和 lock 檔
COPY package*.json ./

# 安裝所有依賴（含 devDependencies）
RUN npm install

# 複製 tsconfig
COPY tsconfig.json ./

# 複製所有原始碼
COPY . .

# 編譯 TypeScript（使用 package.json 版本，避免全域版本差異）
RUN npx tsc --skipLibCheck

# ✅ 關鍵：編譯完後把 views 也複製進 dist
RUN cp -r views dist/views

# 開放 port 3000
EXPOSE 3000

# 設定環境變數
ENV NODE_ENV=production

# 啟動服務
CMD ["node", "dist/bin/server.js"]