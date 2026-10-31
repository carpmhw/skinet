# Docker Image 縮減與 GHCR 發佈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將單一應用 Image 從約 446MB 降到約 209MB，並在 `dev`、`master` 與版本 tag 自動發佈 `linux/amd64` Image 到 GHCR。

**Architecture:** Dockerfile 改以 Alpine + 英文 ICU 作為 runtime，.NET 以 `linux-musl-x64` 發佈並排除 EF Core Design；新增 GitHub Actions workflow 以 `GITHUB_TOKEN` 推送 GHCR；Compose 以 `SKINET_IMAGE` 保留本機預設並支援遠端 Image。

**Tech Stack:** Docker、Buildx、.NET 10、ASP.NET Core、Alpine、GitHub Actions、GHCR、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-10-31-docker-ghcr-image-design.md`

## Global Constraints

- Runtime base 必須是 `mcr.microsoft.com/dotnet/aspnet:10.0-alpine`。
- 必須安裝 `icu-libs` 與 `icu-data-en`，並設定 `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false`。
- .NET restore 與 publish 都必須使用 `-r linux-musl-x64`；publish 必須加上 `--self-contained false`、`-p:SatelliteResourceLanguages=en`、`--no-restore`。
- `Microsoft.EntityFrameworkCore.Design` 必須保留，並加上 `PrivateAssets="all"`；`dotnet ef` 必須仍可執行。
- GHCR Image 名稱固定為 `ghcr.io/carpmhw/skinet`，平台固定 `linux/amd64`。
- Workflow 只在 `dev`、`master`、`v*` tag 與手動觸發時推送；PR 只建置，不得推送。
- Compose 預設 Image 必須維持 `skinet:local`；只有設定 `SKINET_IMAGE` 時才改用其他 Image。
- 文件使用繁體中文；不得把 GHCR token 寫入 repo。
- 未取得使用者明確授權前，不得 `git push`。

## Review Focus

- Alpine 基底仍帶有 `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true`，若未覆寫，ICU 套件等於沒有作用；Task 1 必須檢查容器環境變數為 `false` 且 ICU 檔案存在。
- `linux-musl-x64` 若缺少原生 SQLite，商品 API 會在執行時失敗；Task 1 的 smoke test 必須打到 `/api/products`。
- `PrivateAssets="all"` 若讓 design-time 組件消失，`dotnet ef` 會無法啟動；Task 1 必須實際執行 `dotnet ef migrations list`。
- Workflow 若把 PR 的 `push` 設成 true，fork PR 會嘗試寫入 GHCR；Task 2 必須用 actionlint 與靜態 grep 檢查 PR 條件。
- Compose 的預設值若寫錯，現有本機 `docker compose up -d --build` 會失效；Task 3 必須用 `docker compose config --images` 驗證預設與覆寫值。

---

### Task 1: 縮小 Docker Image

**Files:**
- Create: `docs/superpowers/specs/2026-10-31-docker-ghcr-image-design.md`（已存在，僅提交）
- Create: `docs/superpowers/plans/2026-10-31-docker-ghcr-image.md`（本檔，僅提交）
- Modify: `Dockerfile:16,20,23-25`
- Modify: `API/API.csproj:10`
- Test: `scripts/docker-smoke-test.sh`（既有，不修改）

**Interfaces:**
- Consumes: 無。
- Produces: 大小約 209MB、可通過 smoke test 的 `skinet:local` Image；後續 Task 2、Task 3 直接使用此 Image 與 Dockerfile。

- [ ] **Step 1: 提交已批准的設計與本計畫**

```bash
git add docs/superpowers/specs/2026-10-31-docker-ghcr-image-design.md docs/superpowers/plans/2026-10-31-docker-ghcr-image.md
git commit -m "docs: add Docker image and GHCR design"
```

Expected: commit 成功，`git status --short` 沒有這兩個檔案。

- [ ] **Step 2: 在 `API/API.csproj` 將 EF Core Design 設為私有資產**

將：

```xml
<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.*"/>
```

改為：

```xml
<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.*" PrivateAssets="all" />
```

- [ ] **Step 3: 修改 `Dockerfile` 的 restore、publish 與 runtime**

將 restore 改為：

```dockerfile
RUN dotnet restore API/API.csproj -r linux-musl-x64
```

將 publish 改為：

```dockerfile
RUN dotnet publish API/API.csproj -c Release -r linux-musl-x64 --self-contained false -p:SatelliteResourceLanguages=en -o /out --no-restore
```

將 runtime 區段改為：

```dockerfile
# Runtime: single ASP.NET Core host with Angular and API under one origin
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
RUN apk add --no-cache icu-libs icu-data-en
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
WORKDIR /app
COPY --from=api-build /out/ ./
COPY --from=client-build /src/client/dist/client/ ./wwwroot/
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "API.dll"]
```

- [ ] **Step 4: 建置 Image**

Run:

```bash
docker build -t skinet:local -f Dockerfile .
```

Expected: build 成功，最後一步為 `ENTRYPOINT ["dotnet" "API.dll"]`。

- [ ] **Step 5: 驗證 Image 大小不超過 220MB**

Run:

```bash
size=$(docker image inspect skinet:local --format '{{.Size}}')
awk -v size="$size" 'BEGIN { printf "%.1f MB\n", size/1024/1024; exit (size > 220*1024*1024) }'
```

Expected: 輸出約 `209.x MB`，exit code 0。

- [ ] **Step 6: 驗證 ICU 已啟用且資料存在**

Run:

```bash
docker image inspect skinet:local --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -Fx 'DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false'
docker run --rm --entrypoint sh skinet:local \
  -c 'ls /usr/lib/libicuuc.so* /usr/share/icu/* >/dev/null'
```

Expected: 兩個命令都 exit code 0，沒有輸出或只有 `ls` 的成功結果。

- [ ] **Step 7: 驗證 EF Core design-time 仍可用**

Run:

```bash
dotnet ef migrations list --project Infrastructure --startup-project API --configuration Release
```

Expected: exit code 0，輸出包含 `InitialCreate (Pending)`；EF tools 版本較舊的 warning 可忽略。

- [ ] **Step 8: 執行容器 smoke test**

Run:

```bash
./scripts/docker-smoke-test.sh skinet:local
```

Expected: 以下全部 `PASS`，最後輸出 `Smoke test passed for skinet:local`：

- `/` 200 `text/html`
- `/api/products?pageSize=1` 200 `application/json`
- `/images/products/sb-ang1.png` 200 `image/png`
- `/api/does-not-exist` 404
- SQLite volume 在容器重建後保留 18 個商品

- [ ] **Step 9: 提交 Image 變更**

```bash
git add Dockerfile API/API.csproj
git commit -m "build: shrink runtime image with alpine and icu"
```

Expected: commit 成功，`git status --short` 乾淨。

---

### Task 2: 新增 GHCR Docker Image Workflow

**Files:**
- Create: `.github/workflows/docker-image.yml`
- Test: 無新增測試檔；使用 actionlint 與靜態 grep 驗證。

**Interfaces:**
- Consumes: Task 1 的 `Dockerfile`。
- Produces: push 到 `dev`、`master`、`v*` tag 時，將 `ghcr.io/carpmhw/skinet` 的 `linux/amd64` Image 推到 GHCR；PR 只建置。Task 3 的文件會引用此 workflow 的 tags。

- [ ] **Step 1: 建立 `.github/workflows/docker-image.yml`**

內容必須完全如下：

```yaml
name: Docker image

on:
  push:
    branches: [dev, master]
    tags: ['v*']
  pull_request:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: docker-image-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  packages: write

env:
  IMAGE_NAME: ghcr.io/carpmhw/skinet

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Log in to GHCR
        if: github.event_name != 'pull_request'
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.IMAGE_NAME }}
          flavor: |
            latest=false
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix=sha-

      - name: Build and push
        uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: 用 actionlint 驗證 workflow**

Run:

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

Expected: 沒有輸出，exit code 0。

- [ ] **Step 3: 靜態確認 PR 不會推送**

Run:

```bash
grep -F 'if: github.event_name != '\''pull_request'\''' .github/workflows/docker-image.yml
grep -F 'push: ${{ github.event_name != '\''pull_request'\'' }}' .github/workflows/docker-image.yml
grep -F 'latest=false' .github/workflows/docker-image.yml
```

Expected: 三個 grep 都找到各一行，exit code 0。

- [ ] **Step 4: 提交 workflow**

```bash
git add .github/workflows/docker-image.yml
git commit -m "ci: publish docker image to ghcr"
```

Expected: commit 成功。

---

### Task 3: 支援 GHCR Image 部署並更新文件

**Files:**
- Modify: `docker-compose.yml:3`
- Modify: `README.md`（Docker 執行段落與部署段落）
- Modify: `DEPLOY.md`（單一應用部署段落）
- Test: `docker compose config --images`

**Interfaces:**
- Consumes: Task 2 的 `ghcr.io/carpmhw/skinet` 與 tags。
- Produces: 可用 `SKINET_IMAGE=ghcr.io/carpmhw/skinet:sha-<short>` 部署的 Compose 設定與繁體中文操作文件。

- [ ] **Step 1: 將 Compose Image 改為可覆寫**

將 `docker-compose.yml` 的：

```yaml
    image: skinet:local
```

改為：

```yaml
    image: ${SKINET_IMAGE:-skinet:local}
```

- [ ] **Step 2: 驗證預設值與 GHCR 覆寫值**

Run:

```bash
docker compose config --images
SKINET_IMAGE=ghcr.io/carpmhw/skinet:sha-test docker compose config --images
```

Expected:

- 第一個命令輸出 `skinet:local`。
- 第二個命令輸出 `ghcr.io/carpmhw/skinet:sha-test`。

- [ ] **Step 3: 在 `README.md` 增加 GHCR 使用說明**

在「使用 Docker 執行（建議）」的本機建置指令之後，新增 `### 使用 GHCR Image` 小節，內容需包含：

````markdown
GitHub Actions 會為 `dev`、`master` 與 `v*` tag 建置 `linux/amd64` Image，並發佈到 `ghcr.io/carpmhw/skinet`；PR 只建置，不會推送。可用 tags 包含 `dev`、`master`、`1.2.3`、`1.2` 與 `sha-<short>`；推送 `v1.2.3` git tag 會產生不帶 `v` 前綴的 Image tag。

```bash
# private package 需先登入；public package 可省略
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin

export SKINET_IMAGE=ghcr.io/carpmhw/skinet:sha-<short>
docker compose pull skinet
docker compose up -d --no-build
```

正式部署請優先使用不可變的 `sha-` tag；`dev` 與 `master` 會隨分支更新。完整登入、visibility 與回復說明見 [DEPLOY.md](DEPLOY.md)。
````

- [ ] **Step 4: 在 `DEPLOY.md` 增加 GHCR 部署章節**

在「單一應用部署」的「取得程式與建置」之後，新增 `### 使用 GHCR Image 部署`，內容需包含：

1. 說明 workflow 發佈 `linux/amd64` Image 到 `ghcr.io/carpmhw/skinet`，PR 不推送。
2. private package 的登入指令：

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin
```

3. 指定不可變 tag 並部署：

```bash
export SKINET_IMAGE=ghcr.io/carpmhw/skinet:sha-<short>
docker compose pull skinet
docker compose up -d --no-build
docker compose ps
```

4. package visibility 說明：第一次推送通常為 private；可在 GitHub 的 Packages → `skinet` → Package settings 改成 public，或讓部署主機保持 `read:packages` 權限的 PAT 登入。token 不可提交或寫入 Compose。
5. 回復方式：把 `SKINET_IMAGE` 改回先前的 `sha-` tag，重新 `docker compose pull skinet` 與 `docker compose up -d --no-build`。

同時把「取得程式與建置」的說明改為：`docker-compose.yml` 預設從根目錄 `Dockerfile` 建置 `skinet:local`，也可由 `SKINET_IMAGE` 指定 GHCR Image。

- [ ] **Step 5: 驗證文件包含必要指令**

Run:

```bash
grep -F 'SKINET_IMAGE=ghcr.io/carpmhw/skinet:sha-' README.md DEPLOY.md
grep -F 'docker compose up -d --no-build' README.md DEPLOY.md
```

Expected: 兩個檔案都找到對應指令，exit code 0。

- [ ] **Step 6: 提交 Compose 與文件**

```bash
git add docker-compose.yml README.md DEPLOY.md
git commit -m "docs: document ghcr image deployment"
```

Expected: commit 成功。

---

### Task 4: 完整回歸驗證

**Files:**
- 不新增檔案；驗證目前分支。

**Interfaces:**
- Consumes: Task 1、Task 2、Task 3 的全部變更。
- Produces: 可交付的驗證結果；若發現問題，回到對應 Task 修正後重新執行本 Task。

- [ ] **Step 1: 執行 .NET 測試**

Run:

```bash
dotnet test skinet.sln -c Release
```

Expected: 全部測試通過，exit code 0。

- [ ] **Step 2: 執行前端安裝、lint、測試與 production build**

Run:

```bash
cd client
npm ci --no-audit --no-fund
npm run lint
npm test -- --watch=false
npm run build -- --configuration production
cd ..
```

Expected: lint 沒有 error（既有 warning 可保留）、Vitest 全部通過、Angular production build 成功。

- [ ] **Step 3: 執行兩個 npm audit**

Run:

```bash
cd client
npm audit --include=dev --audit-level=moderate
npm audit --omit=dev --audit-level=high
cd ..
```

Expected: 兩個命令都回報 `found 0 vulnerabilities`。

- [ ] **Step 4: 重新建置 Image 並驗證大小**

Run:

```bash
docker build -t skinet:local -f Dockerfile .
size=$(docker image inspect skinet:local --format '{{.Size}}')
awk -v size="$size" 'BEGIN { printf "%.1f MB\n", size/1024/1024; exit (size > 220*1024*1024) }'
```

Expected: 大小約 `209.x MB`，exit code 0。

- [ ] **Step 5: 執行 smoke test**

Run:

```bash
./scripts/docker-smoke-test.sh skinet:local
```

Expected: 全部 `PASS`，最後輸出 `Smoke test passed for skinet:local`。

- [ ] **Step 6: 驗證 Compose 與 workflow**

Run:

```bash
docker compose config --images
SKINET_IMAGE=ghcr.io/carpmhw/skinet:sha-test docker compose config --images
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

Expected: 第一個輸出 `skinet:local`、第二個輸出 `ghcr.io/carpmhw/skinet:sha-test`、actionlint 沒有輸出且 exit code 0。

- [ ] **Step 7: 確認工作樹乾淨**

Run:

```bash
git status --short
```

Expected: 沒有輸出。若有未提交的驗證產物，先確認是否為測試暫存檔，再刪除；不要提交資料庫、Image 或 log。

- [ ] **Step 8: 回報驗證結果**

在回報中列出：

- Image 實際大小。
- smoke test 的 5 項 PASS。
- `dotnet test` 與 Vitest 通過數量。
- `npm audit` 結果。
- actionlint 結果。
- 尚未驗證的事項：GHCR 實際推送需等使用者授權 push 後，由 GitHub Actions 第一次執行確認。
