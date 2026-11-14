# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

瀏覽雪上運動裝備目錄，並將感興趣商品暫存在購物車的訪客；第一版不要求登入。

## Product Purpose

SkiNet 目前提供商品瀏覽、搜尋、篩選、排序、分頁、詳情、訪客收藏清單、最近瀏覽與瀏覽器購物車。收藏用於保留感興趣的商品，最近瀏覽用於找回成功看過的裝備；購物車只提供選品與展示金額，不表示能完成交易；README 將目前產品定位為電子商務範例。

## Operating Context

- Angular 21 前端、ASP.NET Core 10 商品 API、SQLite，既有部署為單一 Docker Image。
- 已備妥可選 Pages 公開前端＋Functions 同源商品／圖片代理；後端沿用 combined Image，以 Named Tunnel＋Access Service Auth 保護。真實網域與憑證由部署者設定，尚未實際部署或遠端驗收。
- 公開代理可被任何客戶端呼叫；後端限制的是有效 Service Token，不是 Origin／Referer。切換前端 origin 不會自動搬移原購物車。
- 已選擇用 localStorage 保存購物車的商品 ID 與數量；僅在同一瀏覽器、同一 origin 下保留。
- 收藏另以 `skinet.favorites.v1` 保存唯一商品 ID，最新收藏排最前；不保存商品資料、不與購物車共用儲存內容，亦不提供跨裝置／多分頁即時同步。
- 最近瀏覽另以 `skinet.recently-viewed.v1` 保存最近12件唯一商品ID，僅詳情成功回應記錄，新瀏覽與重複瀏覽排最前；顯示清單／收藏／購物車查詢不記錄，不保存URL或時間戳。
- 商品名稱、圖片及目前價格由既有 API 取得，不將瀏覽器內容當作價格權威。

## Capabilities and Constraints

- 使用者已確認第一版只從商品詳情頁加入購物車，商品列表保持不變。
- 範圍為加入、調整數量、移除、重新整理後保留、小計與總額；新增購物車頁與導覽入口。
- 不含會員、跨裝置同步、庫存預留、訂單、付款或結帳；未來交易金額必須由後端驗證。
- 現有介面使用繁體中文與新臺幣格式。
- 商品列表／詳情可切換收藏，導覽顯示計數；`/favorites` 提供最新商品資料、移除與逐項重試。404保留並標示商品無法取得，儲存失敗顯示警告且當次仍可操作；收藏頁不直接加入購物車。
- `/recently-viewed` 提供最近瀏覽入口、最新商品資料、逐項重試及清除全部。404不自行刪除，清除取消未完成查詢；storage移除失敗仍清空記憶體但提示重整後可能重現，不影響收藏／購物車。沒有單項移除、收藏或加入購物車快捷控制。
- 紀錄僅在同瀏覽器／同origin保留，可隨時清除；共用裝置上的其他使用者也可能看到。不新增會員、追蹤分析、遙測、跨裝置／多分頁即時同步；顯示商品仍使用既有API及其後端存取日誌。

## Evidence on Hand

既有 `client/src/app/shop/`、`client/src/app/nav-bar/`、`client/src/styles.scss` 與 `README.md`。購物車位於 `client/src/app/cart/`；本機元件與 service 測試、正式建置與容器測試已執行，實際瀏覽器視覺及讀屏驗收尚未執行。

收藏位於 `client/src/app/favorites/`；本機Angular測試90項、代理測試82項、lint／typecheck／正式建置及獨立程式碼審查已執行。收藏頁的真實瀏覽器375px／桌面、原生鍵盤及讀屏驗收尚未執行，未部署本次收藏功能。

最近瀏覽位於 `client/src/app/recently-viewed/`；本機Angular123項、代理82項、lint／typecheck／正式建置及獨立程式碼審查通過（lint無錯誤，11項standalone警告）。完整紀錄見 `docs/superpowers/plans/2026-11-14-recently-viewed.md`。本次未部署；真實瀏覽器375px／桌面、原生鍵盤及讀屏驗收尚未執行。可選延期改善：清除儲存失敗後的頁內重試入口。

## Approved Cart Rules

使用者已批准且本機已實作每商品 1–99 件、錯誤時保留項目且不顯示完整總額、儲存失敗時降級為記憶體操作；完整行為見 `docs/superpowers/specs/2026-11-12-browser-cart-design.md`。未包含部署或付款流程。
