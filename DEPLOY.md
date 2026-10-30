# Skinet 部署指南

本專案現在預設以 **單一應用 Image** 執行：Angular 前端與 ASP.NET Core API 由同一個 .NET 容器提供，SQLite 資料庫放在 Docker Volume。需要對外測試時，再選擇性啟動一個獨立的 `cloudflared` 容器建立 Cloudflare Quick Tunnel。

```text
瀏覽器 → https://<random>.trycloudflare.com
        → cloudflared 容器
        → http://skinet:8080
        → skinet 容器（Angular + API + 圖片 + SQLite）
```

> Quick Tunnel 只適合 POC／測試，網址每次重啟都可能改變，沒有 SLA。正式環境請另行規劃 Cloudflare Named Tunnel 與自有網域。

## 目錄

- [前置需求](#前置需求)
- [單一應用部署](#單一應用部署)
- [Cloudflare Quick Tunnel](#cloudflare-quick-tunnel)
- [本機除錯](#本機除錯)
- [SQLite 資料持久化與備份](#sqlite-資料持久化與備份)
- [疑難排解](#疑難排解)
- [Quick Tunnel 與 Named Tunnel](#quick-tunnel-與-named-tunnel)
- [舊版分離式部署與回復](#舊版分離式部署與回復)
- [驗收狀態標示](#驗收狀態標示)

## 前置需求

- Docker Engine 24+（或 Docker Desktop）
- Docker Compose v2+
- Linux x64 VPS（本 Image 以 `linux/amd64` 建置；其他架構需確認基底映像支援）
- 對外測試才需要：可收信的電子郵件地址（Cloudflare Quick Tunnel Email PIN）

不需要在 VPS 對外開放 80、443 或 5000。應用容器只監聽內部 `8080`，本機驗證用的 `127.0.0.1:5000` 也只綁定 loopback。

## 單一應用部署

### 取得程式與建置

```bash
git clone <repo-url> && cd skinet
git checkout dev

# 建置並啟動單一應用容器
docker compose up -d --build
```

`docker-compose.yml` 會：

- 從根目錄 `Dockerfile` 建置 `skinet:local`
- 啟動一個 `skinet` 服務，內部監聽 `8080`
- 將 named volume `skinet-data` 掛載到 `/data`
- 使用 `ASPNETCORE_ENVIRONMENT=Production`
- 使用連線字串 `Data source=/data/skinet.db`
- 僅將 `127.0.0.1:5000` 對應到容器 `8080`，不公開到外網

### 啟動、停止、升級、看日誌

```bash
# 啟動（背景）
docker compose up -d

# 停止（保留容器與 Volume）
docker compose stop

# 停止並移除容器（保留 Volume）
docker compose down

# 重新建置並套用程式變更
docker compose up -d --build

# 查看日誌
docker compose logs -f skinet

# 查看狀態
docker compose ps
```

> 絕對不要把 `docker compose down -v` 當成一般重新部署指令。`-v` 會刪除 `skinet-data`，商品資料與資料庫會一起消失。

### 本機驗證

```bash
curl -i http://127.0.0.1:5000/
curl -i 'http://127.0.0.1:5000/api/products?pageSize=50'
curl -i http://127.0.0.1:5000/images/products/sb-ang1.png
curl -i http://127.0.0.1:5000/api/does-not-exist
```

預期：

| URL | 預期 |
|---|---|
| `/` | `200 text/html`，Angular 首頁 |
| `/index.html` | `200 text/html` |
| `/assets/<存在的檔案>` | `200`，正確 MIME |
| `/api/products?pageSize=50` | `200 application/json` |
| `/api/products/9999999` | API 定義的 `404` |
| `/api/does-not-exist` | `404`，不可回傳 Angular HTML |
| `/images/products/<存在的圖片>` | `200 image/*` |
| `/some-client-route` | `200 text/html`（Angular 客戶端路由） |
| `/swagger`、`/api/buggy/servererror` | Production 為 `404` |

## Cloudflare Quick Tunnel

Quick Tunnel 是 opt-in 的額外 Compose overlay，不會因為一般 `docker compose up` 而自動公開。

### 設定允許的 Email

```bash
cp .env.example .env
# 編輯 .env，填入實際可收信的 Email
# TUNNEL_ALLOWED_EMAIL=user@example.com
```

`TUNNEL_ALLOWED_EMAIL` 支援以逗號分隔多個地址。`.env` 已被 `.gitignore` 排除，不可提交。

### 啟動

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

`cloudflared` 會以 Compose 預設網路中的服務名稱連線到 `http://skinet:8080`。**不是** `localhost:5000`，因為兩個容器各自有獨立的網路命名空間。

### 取得臨時網址

```bash
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs --tail=100 cloudflared
```

日誌會出現類似：

```text
https://random-words-1234.trycloudflare.com
```

每次重建 Tunnel 都可能產生不同網址。網址改變時，應用本身不需要重新編譯或修改設定，因為前端、API 與圖片都使用同源相對路徑。

### Email PIN 驗證

1. 用瀏覽器開啟日誌中的 `https://*.trycloudflare.com`。
2. 輸入 `.env` 允許的 Email。
3. 到信箱收取 PIN 並完成驗證。
4. 驗證後確認首頁、商品列表與圖片都正常。

> `--allowed-mail` 需要互動式瀏覽器與收信。自動化 `curl` 無法直接取得受保護的外網資源；請把容器內部 HTTP 測試與外網瀏覽器驗證分開。

### 停止 Tunnel

```bash
# 只停止 Tunnel，保留應用容器
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml stop cloudflared

# 移除 Tunnel 容器
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml rm -f cloudflared
```

## 本機除錯

`docker-compose.yml` 預設已將 `127.0.0.1:5000` 對應到容器 `8080`。這只是 loopback，不會對外公開。

```bash
curl -i http://127.0.0.1:5000/
docker compose logs -f skinet
```

若不需要本機 Port，可將 `docker-compose.yml` 的 `ports` 整段移除。**不要**改成 `5000:8080`，那會讓服務直接暴露到所有網路介面。

## SQLite 資料持久化與備份

資料庫檔案位於容器內 `/data/skinet.db`，由 named volume `skinet-data` 持久化。容器重建不會清除資料；`docker compose down -v` 才會。

### 備份

先停止應用，再將 Volume 打包：

```bash
docker compose stop skinet
docker run --rm \
  -v skinet-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/skinet-data-$(date +%Y%m%d-%H%M%S).tgz -C /data .
docker compose start skinet
```

### 受控還原

只有在確認備份正確、且已停止應用後才執行。先備份目前資料，再還原：

```bash
docker compose stop skinet
docker run --rm \
  -v skinet-data:/data \
  -v "$PWD":/backup \
  alpine sh -c 'rm -f /data/skinet.db /data/skinet.db-shm /data/skinet.db-wal && tar xzf /backup/<backup-file>.tgz -C /data'
docker compose start skinet
```

不要用刪除 Volume、`docker compose down -v` 或直接覆寫使用中的資料庫檔案來「修復」問題。

## 疑難排解

### Tunnel 出現 502 / 1033

- 確認 `skinet` 容器正在執行：`docker compose ps`
- 確認應用日誌沒有啟動失敗：`docker compose logs skinet`
- 確認 Tunnel 的 origin 是 `http://skinet:8080`，不是 `localhost:5000`
- 確認兩個服務在同一個 Compose 網路（使用同一組 `-f` 檔案啟動）

### 應用啟動失敗

```bash
docker compose logs skinet
```

常見原因：

- `/data` 無法寫入（自訂非 root 使用者或 Volume 權限）
- SQLite 檔案損毀或磁碟空間不足
- `ConnectionStrings__DefaultConnection` 被覆寫成錯誤路徑

### `/api/*` 回 404

這是預期行為：不存在的 API 路由必須維持 `404`，不能被 SPA fallback 轉成 `200` HTML。請確認呼叫的是實際存在的 Controller 路由。

不要用 `AllowAnyOrigin()` 或放寬 CORS 來「修正」同源部署問題。

### 圖片 404

- API 回傳的 `pictureUrl` 應為 `/images/products/...`，不可包含 `http://localhost` 或 `http://skinet:8080`
- 確認 Image 內有 `wwwroot/images/products/`
- 確認瀏覽器請求的是同一個 Tunnel 網域

### HTTPS 重新導向迴圈

- 本專案在 Production 不啟用 `UseHttpsRedirection()`；TLS 由 Cloudflare 終止
- 確認反向代理沒有再次強制將 HTTP 導向 HTTPS
- 確認 `cloudflared` 的 origin 是 `http://skinet:8080`
- 不要清空 Forwarded Headers 的信任清單來繞過問題

### Email PIN 無法登入

- 確認 `.env` 的 `TUNNEL_ALLOWED_EMAIL` 與輸入的地址完全一致（含大小寫）
- 修改 `.env` 後需重建 Tunnel 容器：`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --force-recreate cloudflared`
- 確認可正常收信；Quick Tunnel 每次重啟可能產生新網址

## Quick Tunnel 與 Named Tunnel

| 項目 | Quick Tunnel | Named Tunnel |
|---|---|---|
| 網址 | 隨機 `*.trycloudflare.com` | 自有網域 |
| 穩定性 | 無 SLA，重啟可能換網址 | 可長期固定 |
| 設定 | 不需要 Cloudflare 帳號 Token | 需要 Cloudflare 帳號、Tunnel Token、DNS |
| 存取控制 | `--allowed-mail` Email PIN | Cloudflare Access 政策 |
| 本次範圍 | 是 | 否，正式上線需另行規劃 |

未來若要改用 Named Tunnel，請新增獨立的 Compose overlay 或環境設定，**不要把 Tunnel Token 提交到 Git**。

## 舊版分離式部署與回復

舊版 `api` + `client` 兩個服務已移到 `docker-compose.legacy.yml`，僅供比較與緊急回復使用。它會將 API `5000` 與 Client `4200` 對應到主機，使用前請確認防火牆沒有對外暴露這兩個 Port。

```bash
# 舊版啟動（僅在需要比較或回復時）
docker compose -f docker-compose.legacy.yml up -d --build
```

### 回復程序

1. 保留切換前可用的 Image tag 或 commit SHA，以及資料庫備份。
2. 停止 Cloudflare Tunnel：
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tunnel.yml stop cloudflared
   ```
3. 切回已確認可用的版本：
   ```bash
   git checkout <known-good-sha>
   docker compose up -d --build
   ```
   或暫時使用 `docker-compose.legacy.yml`。
4. 若新版本已執行 EF migration，**先確認舊版程式與新 DB schema 相容**再回滾 Image。不相容時走受控備份還原流程。
5. 比對部署前後的商品數量、品牌／種類與重要 API 狀態。
6. 不得用刪除 Volume、`docker compose down -v` 或覆寫資料庫檔案來回復。

## 驗收狀態標示

- 容器內部同源 HTML／API／圖片／404：已由 `scripts/docker-smoke-test.sh` 驗證。
- SQLite 容器重建持久化：同一支 smoke test 會重建容器並保留 Volume，比對商品數量。
  ```bash
  ./scripts/docker-smoke-test.sh
  ```
- Cloudflare Quick Tunnel 外網網址、Email PIN 與 HTTPS：**PENDING MANUAL VERIFICATION**。需要實際 Cloudflare 連線、可收信 Email 與瀏覽器操作，不能以本機 curl 代替。
- VPS 實際部署：**PENDING MANUAL VERIFICATION**。本文件不包含任何自動部署到正式主機的步驟。
