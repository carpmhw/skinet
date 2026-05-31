# Skinet 部署指南

## 目錄

- [Docker 部署（建議）](#docker-部署建議)
- [手動部署](#手動部署)
- [環境變數](#環境變數)

---

## Docker 部署（建議）

### 前置需求

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)（或 Docker Desktop 內建）

### 啟動

```bash
# 克隆專案
git clone <repo-url> && cd skinet

# 啟動所有服務
docker compose up -d

# 查看日誌
docker compose logs -f
```

### 服務對應

| 服務 | 網址 | 說明 |
|------|------|------|
| API | http://localhost:5000 | .NET Web API |
| Client | http://localhost:4200 | Angular SPA（nginx） |

### 資料持久化

SQLite 資料庫透過 Docker volume `skinet-data` 持久化，掛載至容器內的 `/data/`。若需清空資料：

```bash
docker compose down -v
docker compose up -d
```

### 重新建置

```bash
docker compose build --no-cache
docker compose up -d
```

---

## 手動部署

### 後端（API）

#### 前置需求

- [.NET 10 SDK](https://dotnet.microsoft.com/download)

#### 建置與執行

```bash
# 還原與建置
dotnet restore
dotnet build -c Release

# 執行（開發模式）
cd API
dotnet run --configuration Release

# 或直接發佈
dotnet publish API/API.csproj -c Release -o ./publish
./publish/API
```

#### 設定

編輯 `API/appsettings.json`：

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data source=skinet.db"
  },
  "ApiUrl": "http://localhost:5000/"
}
```

若需使用其他資料庫（如 PostgreSQL），請安裝對應 EF Core Provider 並修改連線字串。

---

### 前端（Client）

#### 前置需求

- [Node.js](https://nodejs.org/) 24+
- npm 11+

#### 建置

```bash
cd client

# 安裝相依套件
npm ci

# 開發伺服器
npm start
# → http://localhost:4200

# 生產建置
npm run build -- --configuration production
# 輸出在 client/dist/client/
```

#### 部署靜態檔案

將 `client/dist/client/` 內容部署至任何靜態伺服器（nginx、Apache、CDN 等），並設定 SPA fallback：

```nginx
# nginx 範例
server {
    listen 80;
    root /path/to/dist/client;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:5000/;
    }
}
```

#### API 端點設定

前端 API 請求目標在 `src/app/app.component.ts` 中定義。  
Docker 環境下由 nginx 反向代理處理；手動部署時需確保 CORS 設定一致。

---

## 環境變數

### API

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `ASPNETCORE_ENVIRONMENT` | `Development` | `Docker` 使用 Docker 設定 |
| `ASPNETCORE_URLS` | `http://+:80` | 監聽位置 |
| `ConnectionStrings__DefaultConnection` | `Data source=skinet.db` | 資料庫連線（雙底線為階層式鍵值） |

### Client

無強制環境變數，API URL 透過 nginx 反向代理設定。
