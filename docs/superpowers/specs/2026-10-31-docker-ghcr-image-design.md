# Docker Image 縮減與 GHCR 發佈設計

日期：2026-10-31

## 目的

讓 Skinet 的單一應用 Image 從目前約 **446MB** 降到約 **209MB**，並由 GitHub Actions 自動建置、發佈到 GHCR。部署流程仍維持同一個 Image 同時提供 Angular、API、圖片與 SQLite，不改變對外行為。

## 目標

- 使用 Alpine runtime，保留英文 ICU 全球化行為（應用程式目前只有英文介面）。
- 將 .NET 發佈輸出限定為 `linux-musl-x64`，只保留英文 satellite resources。
- 排除 design-time 的 EF Core Design／Roslyn 檔案，同時保持 `dotnet ef` 可用。
- 新增 GitHub Actions workflow，建置 `linux/amd64` Image 並發佈到 `ghcr.io/carpmhw/skinet`。
- `dev`、`master` 與版本 tag 會發佈；PR 只建置、不推送。
- 保留現有本機 `docker compose up -d --build` 與 smoke test 流程。

## 非目標

- 不支援 `linux/arm64` 或多架構 Image。
- 不做 Image 簽章、SBOM 政策或自動部署到 VPS。
- 不把 GHCR package 自動改成 public；第一次推送後的權限設定仍由維護者處理。
- 不改動 Angular 功能、API 行為或 SQLite schema。
- 不新增 .NET 測試 CI；本次 workflow 只負責 Image 建置與發佈。

## 限制

- GitHub Actions 使用內建 `GITHUB_TOKEN`，需要 `contents: read` 與 `packages: write`。
- PR 來自 fork 時 token 不可寫入套件，因此 PR 必須維持 `push: false`。
- 現有 smoke test 依賴容器內 `sh`、`cat`、`test`，runtime 必須保留 shell。
- `Microsoft.EntityFrameworkCore.Design` 仍須供 `dotnet ef` design-time 使用，不可直接移除套件。
- GHCR 第一次推送通常會建立 private package；部署主機若未登入便無法 pull。
- `aspnet:10.0-alpine` 預設設定 `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`；只安裝 ICU 套件不會啟動 ICU，必須明確設為 `false`。
- Alpine 的 `icu-data-en` 只包含英文文化資料；`en-US` 可正常格式化，但 `zh-TW` 會退回不完整資料。若未來需要其他語系，必須改用 `icu-data-full`，Image 會增加約 43MB。

## 已驗證的量測

| 方案 | 實測大小 | 結果 |
|---|---:|---|
| 現行 `aspnet:10.0` | 446MB | 基準 |
| Alpine + ICU（`icu-libs`、`icu-data-en`、invariant=false） | 209MB | 選定；smoke test 通過 |
| Alpine + invariant globalization | 198MB | 只少 11MB，但有文化行為風險 |
| Noble Chiseled | 202MB | 無 shell、強制 invariant，運維與測試需改寫 |

應用層在 `linux-musl-x64` 發佈、限制英文 satellite resources，並將 EF Core Design 設為 `PrivateAssets="all"` 後，由 70MB 降到 12MB；`dotnet ef migrations list` 已驗證仍可執行。

另外以獨立測試程式驗證：`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false` 搭配 `icu-data-en` 時，`en-US` 的日期與貨幣格式正常；`zh-TW` 因缺少資料而輸出不完整，這是刻意接受的英文-only 限制。

## 方案選擇

### Image runtime

1. **Alpine + ICU（選定）**：209MB，保留英文 ICU 全球化行為與 shell；只比最小方案多 11MB，對現有 smoke test、備份與除錯最安全。
2. **Alpine + invariant**：198MB，但關閉文化敏感格式化與比較，節省有限，不採用。
3. **Noble Chiseled**：202MB，無 shell 且強制 invariant，現有 smoke test 需改寫，不採用。

### GHCR 部署整合

1. **Compose 環境變數（選定）**：`docker-compose.yml` 使用 `image: ${SKINET_IMAGE:-skinet:local}`。本機預設行為不變；部署主機可指定 GHCR Image，再執行 `docker compose pull` 與 `docker compose up -d --no-build`。
2. **另建 GHCR overlay**：需要額外的 Compose 檔案與 `!reset`，對目前單一服務過於複雜，不採用。
3. **只寫文件、不改 Compose**：部署時必須手動 `docker tag` 成 `skinet:local`，容易混淆，不採用。

## 實作內容

### `Dockerfile`

- `api-build` 階段：
  - restore 與 publish 都指定 `-r linux-musl-x64`。
  - publish 加上 `--self-contained false`、`-p:SatelliteResourceLanguages=en`、`--no-restore`。
- runtime 階段改為 `mcr.microsoft.com/dotnet/aspnet:10.0-alpine`。
- 安裝 `icu-libs` 與 `icu-data-en`，並設定 `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false`，覆寫 Alpine 基底的 invariant 預設值。
- 保留 `ASPNETCORE_URLS=http://+:8080`、Production 環境與 `dotnet API.dll` entrypoint。

### `API/API.csproj`

- `Microsoft.EntityFrameworkCore.Design` 加上 `PrivateAssets="all"`，避免 design-time 組件進入 publish 輸出。

### `.github/workflows/docker-image.yml`

- 觸發：
  - push 到 `dev`、`master`。
  - push 版本 tag（`v*`）。
  - PR 到 `master`（只建置）。
  - `workflow_dispatch`。
- 權限：`contents: read`、`packages: write`。
- 平台：`linux/amd64`。
- 使用 `docker/setup-buildx-action`、`docker/login-action`、`docker/metadata-action`、`docker/build-push-action`。
- Image 名稱：`ghcr.io/carpmhw/skinet`。
- Tags：
  - 分支：`dev`、`master`。
  - 版本 tag：`1.2.3`、`1.2`。
  - 每次建置：`sha-<short>`。
  - PR：不推送，因此不產生 registry tag。
- 快取：GitHub Actions cache（`type=gha`）。
- PR 的 `push` 固定為 `false`；其他事件才登入 GHCR 並推送。

### Compose 與文件

- `docker-compose.yml` 的 image 改為 `${SKINET_IMAGE:-skinet:local}`。
- `README.md` 增加 GHCR Image 說明、可用 tags、pull 與啟動指令。
- `DEPLOY.md` 增加：
  - GHCR 登入方式（private package 時使用 PAT `read:packages`）。
  - 指定 `SKINET_IMAGE` 的部署與回復方式。
  - 第一次推送後將 package 設為 public，或讓主機保持登入的取捨。

## 驗證

- `docker build -t skinet:local .`，確認最終大小約 209MB。
- `./scripts/docker-smoke-test.sh skinet:local`：首頁、API、圖片、404、SQLite volume 持久化全部通過。
- `dotnet ef migrations list --project Infrastructure --startup-project API --configuration Release` 仍可執行。
- `npm ci`、Angular production build、Vitest、lint 與 `npm audit` 維持通過。
- 以 YAML parser 檢查 workflow 語法。
- GHCR 實際推送需在取得授權 push 後，由 GitHub Actions 第一次執行驗證；本機無法完整模擬。

## 留給實作階段決定

- GitHub Actions 各 action 的實際 stable major 版本。
- workflow 的 job 名稱、timeout 與 concurrency 細節。
- README／DEPLOY 的段落位置與實際指令措辭。
- 是否在版本 tag 同時產生 `latest`；本設計預設不產生，避免浮動標籤混淆。
