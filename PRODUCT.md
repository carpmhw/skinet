# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

瀏覽雪上運動裝備目錄，並將感興趣商品暫存在購物車的訪客；第一版不要求登入。

## Product Purpose

SkiNet 目前提供商品瀏覽、搜尋、篩選、排序、分頁、詳情與瀏覽器購物車。購物車只提供選品與展示金額，不表示能完成交易；README 將目前產品定位為電子商務範例。

## Operating Context

- Angular 21 前端、ASP.NET Core 10 商品 API、SQLite，既有部署為單一 Docker Image。
- 已選擇用 localStorage 保存購物車的商品 ID 與數量；僅在同一瀏覽器、同一 origin 下保留。
- 商品名稱、圖片及目前價格由既有 API 取得，不將瀏覽器內容當作價格權威。

## Capabilities and Constraints

- 使用者已確認第一版只從商品詳情頁加入購物車，商品列表保持不變。
- 範圍為加入、調整數量、移除、重新整理後保留、小計與總額；新增購物車頁與導覽入口。
- 不含會員、跨裝置同步、庫存預留、訂單、付款或結帳；未來交易金額必須由後端驗證。
- 現有介面使用繁體中文與新臺幣格式。

## Evidence on Hand

既有 `client/src/app/shop/`、`client/src/app/nav-bar/`、`client/src/styles.scss` 與 `README.md`。購物車位於 `client/src/app/cart/`；本機元件與 service 測試、正式建置與容器測試已執行，實際瀏覽器視覺及讀屏驗收尚未執行。

## Approved Cart Rules

使用者已批准且本機已實作每商品 1–99 件、錯誤時保留項目且不顯示完整總額、儲存失敗時降級為記憶體操作；完整行為見 `docs/superpowers/specs/2026-11-12-browser-cart-design.md`。未包含部署或付款流程。
