#!/usr/bin/env bash
# 啟動單一應用 Image，驗證同源 HTML、JSON、圖片與未知 API 404。
set -euo pipefail

image=${1:-skinet:local}
name="skinet-smoke-$$"
volume="skinet-smoke-data-$$"
body_file=$(mktemp)

# 清除測試容器、暫存 volume 與暫存檔。
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  rm -f "$body_file"
}
trap cleanup EXIT

# 啟動指定 Image 的測試容器。
start_container() {
  docker run -d --name "$name" \
    -p 127.0.0.1::8080 \
    -e ASPNETCORE_ENVIRONMENT=Production \
    -e 'ConnectionStrings__DefaultConnection=Data source=/data/skinet.db' \
    -v "${volume}:/data" \
    "$image" >/dev/null

  port=$(docker port "$name" 8080/tcp | head -n1 | awk -F: '{print $NF}')
}

# 等待應用啟動與完成資料庫 Seed，最多 60 秒。
wait_for_app() {
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
}

# 檢查指定路徑的狀態碼與 Content-Type 前綴。
check_response() {
  local path=$1
  local expected_status=$2
  local expected_type=$3
  local result status content_type

  result=$(curl -sS -o "$body_file" -w '%{http_code} %{content_type}' "http://127.0.0.1:${port}${path}")
  status=${result%% *}
  content_type=${result#* }

  if [ "$status" != "$expected_status" ]; then
    echo "FAIL $path: status $status, expected $expected_status" >&2
    exit 1
  fi

  if [ -n "$expected_type" ] && [[ "$content_type" != "$expected_type"* ]]; then
    echo "FAIL $path: content-type $content_type, expected $expected_type" >&2
    exit 1
  fi

  echo "PASS $path: $status $content_type"
}

# 取得商品總數，用於容器重建後的持久化比對。
product_count() {
  curl -sS "http://127.0.0.1:${port}/api/products?pageSize=1" \
    | grep -o '"count":[0-9]*' \
    | head -n1 \
    | cut -d: -f2
}

docker volume create "$volume" >/dev/null
start_container
wait_for_app

check_response "/" 200 "text/html"
check_response "/api/products?pageSize=1" 200 "application/json"
check_response "/images/products/sb-ang1.png" 200 "image/png"
check_response "/api/does-not-exist" 404 ""

# 確認未知 API 回應不是 Angular 首頁。
if grep -qi '<html' "$body_file"; then
  echo "FAIL /api/does-not-exist returned HTML" >&2
  exit 1
fi

# 重建容器但保留 Volume，確認 SQLite 資料仍在。
before=$(product_count)
if [ -z "$before" ]; then
  echo "FAIL persistence: could not read product count" >&2
  exit 1
fi

docker rm -f "$name" >/dev/null
start_container
wait_for_app

after=$(product_count)
if [ -z "$after" ] || [ "$before" != "$after" ]; then
  echo "FAIL persistence: product count $before -> ${after:-unreadable}" >&2
  exit 1
fi

echo "PASS persistence: $before products after container recreation"
echo "Smoke test passed for $image"
