# SkiNet 專案指引

本檔只記錄 SkiNet 特有的規範；通用代碼規範與 Playwright 版本以全域 AGENTS.md 為準。

## 專案概要

- 雪上運動裝備目錄範例：Angular 21 SPA（`client/`）＋ ASP.NET Core 10 API（`API/`、`Core/`、`Infrastructure/`）＋ SQLite，正式部署為單一 Docker Image。
- 產品範圍、儲存行為與刻意不做的事項以 `PRODUCT.md` 為準；變更功能行為前先讀，避免重新討論已定案的範圍。
- 部署細節見 `DEPLOY.md`，執行與 API 說明見 `README.md`。

## 產品邊界

- 不含會員、訂單、付款、結帳與跨裝置同步；介面使用繁體中文與新臺幣格式。
- 價格權威在 API，前端不得以瀏覽器保存的內容作為價格來源。
- 瀏覽器儲存各自獨立、只存商品 ID（與數量）：`skinet.cart.v1`、`skinet.favorites.v1`、`skinet.recently-viewed.v1`；商品比較只存在記憶體，不寫入任何 storage。

## 驗證指令

依變更範圍執行，完成前回報實際結果：

```bash
# 後端
dotnet test skinet.sln -c Release

# 前端（於 client/）
npm run lint
npm run lint:proxy && npm run check:proxy && npm run test:proxy   # 改到 server/、functions/ 時
npm test -- --watch=false
npm run build -- --configuration production

# 真實瀏覽器回歸（未納入 CI，改到 UI 行為時必須在本機執行）
npm run check:e2e
npm run e2e:browser

# 容器冒煙（改到 Dockerfile、託管或持久化時）
docker build -t skinet:local -f Dockerfile . && ./scripts/docker-smoke-test.sh skinet:local
```

- 前端使用 npm（`package-lock.json`），不改用其他套件管理器。
- e2e 測試會自行建置並使用暫存 webroot 與 SQLite，不得寫入 `API/wwwroot` 或 repo 內的資料庫。

## 依賴

- `client/package.json` 的 `overrides` 是安全修補用的版本固定，不得任意移除或放寬；調整後須通過 CI 的 `npm audit` 閘門。

## 工作流程

- 在 `dev` 分支開發，以 PR 合併進 `master`。
- Commit 使用 Conventional Commits 前綴（`feat`、`fix`、`test`、`docs`、`chore(deps)`、`ci`、`refactor` 等，可加 scope 如 `feat(client):`），描述用繁體中文。
- 新功能的 spec 放 `docs/superpowers/specs/YYYY-MM-DD-<主題>-design.md`，plan 放 `docs/superpowers/plans/YYYY-MM-DD-<主題>.md`；完成的任務歸檔至 `docs/superpowers/plans/archive/<同名>.archive.md`。
- 功能行為改變時，同步更新 `PRODUCT.md` 與 `README.md` 的對應說明（含測試涵蓋範圍與限制）。

## 安全

- 不得提交 `.env`、資料庫檔、憑證或 Tunnel token。
- Swagger 與 `BuggyController` 僅限 Development；未知 `/api/*` 與 `/swagger*` 在 Production 必須回傳 404，不可被 SPA fallback 吞掉。
