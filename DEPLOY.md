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
- [使用 GHCR Image 部署](#使用-ghcr-image-部署)
- [Cloudflare Quick Tunnel](#cloudflare-quick-tunnel)
- [公開 Pages 與 Named Tunnel](#公開-pages-與-named-tunnel)
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

- 預設從根目錄 `Dockerfile` 建置 `skinet:local`；也可由 `SKINET_IMAGE` 指定 GHCR Image
- 啟動一個 `skinet` 服務，內部監聽 `8080`
- 將 named volume `skinet-data` 掛載到 `/data`
- 使用 `ASPNETCORE_ENVIRONMENT=Production`
- 使用連線字串 `Data source=/data/skinet.db`
- 僅將 `127.0.0.1:5000` 對應到容器 `8080`，不公開到外網

### 使用 GHCR Image 部署

GitHub Actions 的 `Docker image` workflow 會為 `dev`、`master` 與 `v*` tag 建置 `linux/amd64` Image，發佈到 `ghcr.io/carpmhw/skinet`；PR 只建置，不會推送。建議部署時使用不可變的 `sha-<short>` tag，避免分支 tag 在下次推送後變動。

第一次推送通常會建立 private package。部署主機需要具備 `read:packages` 權限的 GitHub PAT：

```bash
export GHCR_TOKEN='<your-pat>'
echo "$GHCR_TOKEN" | docker login ghcr.io -u '<github-user>' --password-stdin
```

若已在 GitHub 的 Packages → `skinet` → Package settings 將 package 改為 public，則可省略登入。不要把 token 寫入 Compose 或 repo；使用後可執行 `unset GHCR_TOKEN`。

指定 Image 並部署：

```bash
export SKINET_IMAGE='ghcr.io/carpmhw/skinet:sha-<short>'
docker compose pull skinet
docker compose up -d --no-build
docker compose ps
```

回復時把 `SKINET_IMAGE` 改成先前的 `sha-` tag，再重新執行 `docker compose pull skinet` 與 `docker compose up -d --no-build`。若資料庫已套用不相容的 migration，仍需依下方備份還原流程處理。

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

資料庫檔案位於容器內 `/data/skinet.db`，由 Compose named volume 持久化。實際 Volume 名稱通常是 `<Compose 專案名稱>_skinet-data`；本專案目錄名為 `skinet` 時是 `skinet_skinet-data`。**不要假設名稱**，先取得容器實際掛載的 Volume：

```bash
VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$(docker compose ps -aq skinet)")
echo "$VOLUME"
```

若輸出為空，代表容器尚未建立；先執行 `docker compose up -d`，或用 `docker volume ls` 找到 `<project>_skinet-data`。容器重建不會清除資料；`docker compose down -v` 才會。

### 備份

先取得實際 Volume 名稱，再停止應用並打包：

```bash
VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$(docker compose ps -aq skinet)")
test -n "$VOLUME" || { echo "找不到 skinet 的 /data volume，請先啟動容器"; exit 1; }
docker compose stop skinet
docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/skinet-data-$(date +%Y%m%d-%H%M%S).tgz -C /data .
docker compose start skinet
```

### 受控還原

只有在確認備份正確、且已停止應用後才執行。先備份目前資料，再還原：

```bash
VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$(docker compose ps -aq skinet)")
test -n "$VOLUME" || { echo "找不到 skinet 的 /data volume，請先啟動容器"; exit 1; }
docker compose stop skinet
docker run --rm \
  -v "$VOLUME":/data \
  -v "$PWD":/backup \
  alpine sh -c 'rm -f /data/skinet.db /data/skinet.db-shm /data/skinet.db-wal && tar xzf /backup/<backup-file>.tgz -C /data'
docker compose start skinet
```

不要用刪除 Volume、`docker compose down -v` 或直接覆寫使用中的資料庫檔案來「修復」問題。

### 舊版分離式部署升級前備份

舊版 `api` service 的 Volume 可能由舊 Compose 專案建立，名稱不一定是 `skinet_skinet-data`。切換到新部署前，先對執行中的舊 `api` 容器取得實際 Volume：

```bash
VOLUME=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$(docker compose -f docker-compose.legacy.yml ps -aq api)")
test -n "$VOLUME" || { echo "找不到舊 api 的 /data volume"; exit 1; }
docker compose -f docker-compose.legacy.yml stop api
docker run --rm \
  -v "$VOLUME":/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/skinet-legacy-data-$(date +%Y%m%d-%H%M%S).tgz -C /data .
docker compose -f docker-compose.legacy.yml start api
```

若舊部署不是用 `docker-compose.legacy.yml` 啟動，請把 `docker compose -f docker-compose.legacy.yml ps -aq api` 換成實際 `api` 容器 ID（例如 `docker ps -aq --filter name=api`）。

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
| 配置 | 舊測試入口保留 | 已備妥獨立配置，實際部署待驗收 |

### Quick Tunnel 已知限制

- 為測試／開發設計，沒有正式 uptime 保證。
- URL 不固定，Tunnel 結束後失效。
- 上限為 200 個同時進行中的請求，超出可能回 `429`。
- 不支援 SSE。
- `--allowed-mail` 需要互動式瀏覽器與收信；非互動式 `curl` 無法直接取得受保護的外網資源。
- 隨機 URL 本身不是存取控制，請保留 Email PIN。

Named Tunnel 請使用下方獨立配置，**不要把 Tunnel Token 提交到 Git**。

## 公開 Pages 與 Named Tunnel

此為選用部署方式；設定已備妥，但未建立 Cloudflare 資源、部署或驗收外網。

```text
訪客 → Pages Angular（公開、不要求 PIN）
     → 同源 /api/*、/images/* 的 Pages Functions
     → https://api.example.com（Access Service Auth）
     → Named Tunnel → http://skinet:8080 → SQLite /data
```

後端仍使用現有 combined Image，沒有另建 API-only Image。其根頁即使存在也受整個 hostname 的 Access 保護；公開代理不開放根頁、Swagger、buggy 或寫入 API。這不是防爬：任何客戶端可查公開目錄；任何持有有效 Service Token 的程式都可能直連後端。Origin／Referer 不作身份驗證。

### 1. 準備 hostname、Access 與 Named Tunnel

需要 Cloudflare 帳號、受管理的自有網域、Pages 專案與 Named Tunnel。下列 `api.example.com` 全部替換為同一個真實 API hostname；範例不會建立 DNS。

1. 建立 Named Tunnel，安全取得 connector token。
2. **先**為 API hostname 建立 self-hosted Access application，涵蓋所有路徑（不要只保護 `/api`，圖片與根頁也必須受保護）。
3. 建立 Access Service Token，政策 action 選 **Service Auth**，include 僅選指定 **Service Token**。不得加 Everyone、訪客 Email Allow 或 Bypass 政策。核對沒有更精確的子路徑 application 繞過此限制。
4. 確認 Access 已涵蓋 hostname，再設定 Tunnel published application route／DNS，origin 為 `http://skinet:8080`，不是 `localhost:5000`。不要把容器 HTTP 改成重新導向公網 HTTPS。
5. 未驗證無 token 與錯 token 都被拒絕前，不切換正式入口。

兩種 token 不可混用：

| 參數 | 放置位置 |
|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | 後端 `.env.named`，Compose 映射為 cloudflared 的 `TUNNEL_TOKEN` |
| `API_ORIGIN=https://api.example.com` | Pages Functions runtime variable，HTTPS origin，不能有帳密、路徑、query 或 fragment |
| `CF_ACCESS_CLIENT_ID` | Pages encrypted Secret（Access Service Token ID） |
| `CF_ACCESS_CLIENT_SECRET` | Pages encrypted Secret（Access Service Token Secret） |

真值不進 Angular、Git、瀏覽器、對話或日誌。不要輸出含真實 token 的 `docker compose config`、`docker inspect` 或 shell tracing；配置驗證用 `config --quiet`。

### 2. 確認 SQLite Volume 與受控切換

沿用本文件的備份程序，**先取得舊容器實際的 /data Volume 名稱並備份**：

```bash
docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$(docker compose ps -aq skinet)"
cp .env.named.example .env.named
chmod 600 .env.named
```

編輯 `.env.named`：填入已驗證的固定 Image `sha-` tag、上述實際 `SKINET_DATA_VOLUME` 名稱與 connector token。舊容器不在預設 Compose 專案時，改用實際容器 ID。若找不到舊資料，先查明，不得藉由新建 Volume 掩蓋問題。

只有全新安裝才由部署者明確建立空 Volume：

```bash
docker volume create skinet-named-data
# 將 .env.named 的 SKINET_DATA_VOLUME 填成 skinet-named-data
```

新配置將該 Volume 宣告為 external；缺值或不存在時拒絕啟動，不自動建立另一份空 DB。保留切換前 Image tag、Compose project 名稱與備份，不允許兩個應用同時對同一 SQLite 做啟動 migration。

在授權的維護時段先停止舊 Quick Tunnel／其他直接入口及舊應用，再啟動新組合。同一專案沿用預設 project 時，執行：

```bash
# 僅在原本使用此組配置時，停止舊入口與應用；不刪除 Volume
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml stop cloudflared skinet

docker compose --env-file .env.named -f docker-compose.named.yml config --quiet
docker compose --env-file .env.named -f docker-compose.named.yml pull
docker compose --env-file .env.named -f docker-compose.named.yml up -d --no-build
docker compose --env-file .env.named -f docker-compose.named.yml ps
```

若使用自訂 project，所有操作一致加 `-p <原專案名>`，或明確管理新舊 project 的停止與網路。Named 配置是**獨立檔案**，不要疊加 `docker-compose.yml` 或 `docker-compose.tunnel.yml`，避免舊 ports／Email PIN 參數殘留。切換後必須確認沒有其他未受 Access 保護的 Tunnel／反向代理／公開 port；不關閉舊入口就不符合此部署邊界。

Named 預設無 host port。需要本機診斷才另加：

```bash
docker compose --env-file .env.named -f docker-compose.named.yml -f docker-compose.named.debug.yml up -d --no-build
curl -i http://127.0.0.1:5000/api/products
```

debug 只綁 `127.0.0.1:5000`，不是公開入口。`cloudflared:latest` 是本次配置的預設值；pull 可能升級 connector，請在維護時段驗收並記錄實際版本／digest，不保證其行為永遠不變。

### 3. Pages Git Integration

連結 repository，設定：

| 欄位 | 值 |
|---|---|
| Root directory | `client` |
| Production branch | 由部署者選擇，範例 `dev` |
| Node version | `24`（如 `NODE_VERSION=24` 建置變數） |
| Build command | `npm run build -- --configuration production` |
| Build output directory | `dist/client`（相對 root directory） |

`client/functions/` 是伺服器入口，不要移進靜態輸出或改用不支援 Functions 的單純靜態上傳。建置會把 `client/pages/_routes.json` 複製到輸出根目錄，僅 `/api`、`/api/*`、`/images`、`/images/*` 執行 Functions；其餘靜態頁面不耗代理請求。保留 Pages 預設 SPA fallback，不新增 `404.html` 或把 API 全部 rewrite 至 index.html。

在 Pages Functions 的 Production runtime 設定 `API_ORIGIN` 與兩個 encrypted Secrets，變更後**重新部署**；不是改 Angular environment。`client/.dev.vars.example` 只是本機 Functions 範例，不會自動成為 Dashboard binding，`ng serve` 也不執行 Pages Functions。

Preview 與 Production 分開設定；Preview 預設不放上述 credentials，合法商品請求回 `503`，靜態頁仍可預覽。不要讓不受信任 fork 或任意 PR build 接觸 production secrets；如需完整 preview，另用受信任分支與獨立 Service Token。具有 production build／部署權限的程式碼必須可信。

**Git Integration 不會等待 GitHub Actions checks。** 既有 CI 仍含 Angular、proxy、audit、.NET、Image smoke 與 GHCR 發佈 gate，但 Pages 自動部署是另一流程。若要強制「CI 成功才部署 Pages」，需另設 CI-controlled deployment，這次未新增持有 Cloudflare token 的 workflow。

Functions 有請求／計費配額，圖片也算請求；所有代理回應 `Cache-Control: no-store`，不承諾無限免費。於 Pages Functions 配額／失敗模式選 **fail closed**，避免超額時 `/api` 或 `/images` 落回靜態 SPA；實際超額頁可能由平台產生，不保證使用本代理的 JSON。

### 4. 代理合約與排查

- GET／HEAD：`/api/products`、`/api/products/{正整數 id}`、`/api/products/brands`、`/api/products/types`，以及 `/images/products/{單一檔名}`，圖片副檔名限 png／jpg／jpeg／webp／gif／avif。
- 保留列表 query；不轉送訪客 Cookie、Authorization、Host 或 Access headers。HEAD 上游使用 GET，回應不含 body。
- 未允許路徑回固定 `404`，其他 method 回 `405`。缺失／無效 runtime bindings 為 `503 Proxy is not configured`，不會 fallback 到公開後端。
- 認證拒絕、redirect、非預期 HTML 或網路錯誤為 `502 Backend unavailable`。檢查 Service Token 是否過期、政策是否 Service Auth、API_ORIGIN 是否同 hostname、Tunnel route 是否正確，以及 backend 是否正常；不要用 Bypass／CORS 放寬代替修復。
- 普通 API JSON 錯誤保留狀態碼，圖片不存在回 `404`；不透傳 Set-Cookie、認證 headers 或登入 redirect。

### 5. 遠端驗收（目前全部 NOT RUN）

本機測試不能代替以下驗收，需填入真實設定並獲授權部署：

1. 直接請求 API hostname（根頁、商品 API 與圖片），無 token／錯 token 都被 Access 拒絕；不要用 `curl -L` 掩蓋登入 redirect。
2. 正確 Service Token 可取得商品 JSON／圖片。若以 curl 驗證，使用受保護且未追蹤的 header 設定檔，不貼真值於命令、shell history、輸出或對話。
3. 未登入的訪客可在 Pages 瀏覽目錄、搜尋、篩選、排序、分頁、詳情、圖片與購物車；`/shop`、`/shop/17`、`/cart` 重新整理仍能操作。
4. Pages `/api`、`/images`、未知子路徑、`/api/buggy/servererror` 為真 404，不能回 200 index.html；`/swagger` 不得取得後端 Swagger（可能是前端 SPA），POST 商品 API 為 405。
5. 檢查瀏覽器 network、Angular bundle 與回應沒有 Service Token／Set-Cookie；認證錯誤不轉給訪客登入頁。
6. Preview 無憑證回 503；靜態資產不執行 Functions；核對平台 fail-closed 設定。
7. 核對切換前後商品數量與 SQLite Volume 名稱，舊入口已關閉。前端換 origin 後購物車不自動搬移。

### 6. 輪替與回復

Access Service Token：建立新 token → Access 政策允許新 token → 更新受信任 Pages runtime Secrets 並 redeploy → 驗證新 token 與公開頁 → 撤銷舊 token，確認舊 token 拒絕。Tunnel connector token 依 Cloudflare 流程另外輪替並重建 connector，不可互換。

回復優先用同一 Named 配置改回已驗證的 Image tag 並 `pull`／`up -d --no-build`，external Volume 名稱保持不變；必須先確認 DB schema 相容。若不相容，先停止應用並依受控備份流程還原，不用刪 Volume 修復。

要回到舊 combined／Quick Tunnel 配置，先停止 Named connector 與應用，保留 Volume，確認舊配置會掛載**同一個**實際 Volume（project 名稱需核對），再啟動先前已記錄的版本及入口；不得同時留下未受保護入口。恢復前也需確認 Pages 公開代理的後端仍符合其 Service Auth 合約，否則暫停該公開入口。保留 Quick Tunnel 配置不代表先前的 Email session 問題已修復；重新驗收其登入行為。

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
