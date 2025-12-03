# 使用官方 Node.js 基礎映像
FROM node:20-alpine

# 建立工作目錄
WORKDIR /app

# 將 package.json 和 package-lock.json (如果存在) 複製到工作目錄
# 這樣做可以利用 Docker 的緩存機制
COPY package*.json ./

# 安裝依賴項
RUN npm install

# 複製所有應用程式程式碼到容器中
COPY . .

# 曝露 Node.js 服務運行的端口 (您的 server.js 中設定的是 3000)
EXPOSE 3000

# 啟動 Node.js 應用程式
CMD [ "node", "server.js" ]