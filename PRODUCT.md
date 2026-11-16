# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

瀏覽雪上運動裝備目錄，並將感興趣商品暫存在購物車的訪客；第一版不要求登入。

## Product Purpose

SkiNet 目前提供商品瀏覽、搜尋、篩選、排序、分頁、詳情、訪客收藏清單、最近瀏覽、商品比較與瀏覽器購物車。收藏用於保留感興趣的商品，最近瀏覽用於找回成功看過的裝備，比較用於並排對照候選商品；購物車只提供選品與展示金額，不表示能完成交易；README 將目前產品定位為電子商務範例。

## Operating Context

- Angular 21 前端、ASP.NET Core 10 商品 API、SQLite，既有部署為單一 Docker Image。
- 已備妥可選 Pages 公開前端＋Functions 同源商品／圖片代理；後端沿用 combined Image，以 Named Tunnel＋Access Service Auth 保護。真實網域與憑證由部署者設定，尚未實際部署或遠端驗收。
- 公開代理可被任何客戶端呼叫；後端限制的是有效 Service Token，不是 Origin／Referer。切換前端 origin 不會自動搬移原購物車。
- 已選擇用 localStorage 保存購物車的商品 ID 與數量；僅在同一瀏覽器、同一 origin 下保留。
- 收藏另以 `skinet.favorites.v1` 保存唯一商品 ID，最新收藏排最前；不保存商品資料、不與購物車共用儲存內容，亦不提供跨裝置／多分頁即時同步。
- 最近瀏覽另以 `skinet.recently-viewed.v1` 保存最近12件唯一商品ID，僅詳情成功回應記錄，新瀏覽與重複瀏覽排最前；顯示清單／收藏／購物車查詢不記錄，不保存URL或時間戳。
- 比較使用獨立ComparisonService，只在當次記憶體保留最多3個唯一商品ID，依選取先後追加；跨路由共享但重新整理清空，不存取localStorage／sessionStorage，不提供持久化或分享URL。
- 商品名稱、圖片及目前價格由既有 API 取得，不將瀏覽器內容當作價格權威。
- 價格區間以URL保存已套用的minPrice／maxPrice，表單另存草稿；前端使用整數分，API以decimal在資料庫分頁前篩選並共用count條件，不在前端只篩當頁。

## Capabilities and Constraints

- 使用者已確認第一版只從商品詳情頁加入購物車，商品列表保持不變。
- 範圍為加入、調整數量、移除、重新整理後保留、小計與總額；新增購物車頁與導覽入口。
- 不含會員、跨裝置同步、庫存預留、訂單、付款或結帳；未來交易金額必須由後端驗證。
- 現有介面使用繁體中文與新臺幣格式。
- 商品列表／詳情可切換收藏，導覽顯示計數；`/favorites` 提供最新商品資料、移除與逐項重試。404保留並標示商品無法取得，儲存失敗顯示警告且當次仍可操作；收藏頁不直接加入購物車。
- `/recently-viewed` 提供最近瀏覽入口、最新商品資料、逐項重試及清除全部。404不自行刪除，清除取消未完成查詢；storage移除失敗仍清空記憶體但提示重整後可能重現，不影響收藏／購物車。沒有單項移除、收藏或加入購物車快捷控制。
- 紀錄僅在同瀏覽器／同origin保留，可隨時清除；共用裝置上的其他使用者也可能看到。不新增會員、追蹤分析、遙測、跨裝置／多分頁即時同步；顯示商品仍使用既有API及其後端存取日誌。
- 列表／成功詳情可切換比較，導覽「比較（N）」連到 `/compare`。第4件拒絕加入並解釋上限，已選仍可取消；比較頁只對照既有圖片／價格／品牌／類型／介紹，可逐欄移除、清空及重試，不虛構尺寸／重量／庫存／評分。
- 比較表格保留語意化表頭及橫向捲動；載入失敗／404不自動移除，未知價格不當0，取消移除／清空／離頁的未完成請求。比較查詢不記錄最近瀏覽、不影響收藏或購物車，亦不提供直接收藏／加入購物車快捷動作。
- 最低／最高價格可只填單邊，包含上下界，0與相等範圍合法；上限99,999,999.99、最多兩位小數。接受前導零與兩端空白；拒絕正負號、逗號、貨幣符號、科學記號及三位小數，不交換／四捨五入。
- 價格送出才套用、保留其他條件並回第1頁；草稿錯誤保留已套用結果並提示「價格尚未套用」。非法價格URL保留輸入、展開篩選區、取消商品請求且不顯示舊結果，不會靜默查全部商品；修正／清除後恢復查詢。
- 「清除價格」保留其他條件，「清除條件」清全部；網址、分頁、詳情返回及歷史導航保留合法價格。不新增storage、追蹤或價格分布API；正式啟用先更新後端再更新Pages，舊API忽略價格的200不算驗收通過。

## Evidence on Hand

既有 `client/src/app/shop/`、`client/src/app/nav-bar/`、`client/src/styles.scss` 與 `README.md`。購物車位於 `client/src/app/cart/`；本機元件與 service 測試、正式建置與容器測試已執行；2026-11-16 起瀏覽器回歸測試涵蓋購物車流程（見下方瀏覽器測試段落），視覺細節與讀屏驗收尚未執行。

收藏位於 `client/src/app/favorites/`；本機Angular測試90項、代理測試82項、lint／typecheck／正式建置及獨立程式碼審查已執行。重新整理保留、移除與375px無水平溢出已於2026-11-16由瀏覽器測試驗證；桌面版排版細節、原生鍵盤操作及讀屏驗收尚未執行，未部署本次收藏功能。

最近瀏覽位於 `client/src/app/recently-viewed/`；本機Angular123項、代理82項、lint／typecheck／正式建置及獨立程式碼審查通過（lint無錯誤，11項standalone警告）。完整紀錄見 `docs/superpowers/plans/2026-11-14-recently-viewed.md`。本次未部署；最新在前、重新整理保留、清除與375px無水平溢出已於2026-11-16由瀏覽器測試驗證，桌面版排版細節、原生鍵盤操作及讀屏驗收尚未執行。可選延期改善：清除儲存失敗後的頁內重試入口。

比較位於 `client/src/app/comparison/`；本機Angular149項、代理82項、兩套lint／proxy typecheck／正式建置及獨立程式碼審查通過（lint無錯誤，13項standalone警告：11既有、2新增NgModule元件）。紀錄見 `docs/superpowers/plans/2026-11-15-product-comparison.md`。本次未部署；3件上限、選取順序、重新整理清空且不寫storage、375px整頁無溢出及表格方向鍵捲動已於2026-11-16由瀏覽器測試驗證；桌面版排版、五項導覽換行、sticky與讀屏驗收尚未執行。

價格篩選位於既有shop與商品API；本機API67項、Angular197項、代理84項、兩套lint／proxy typecheck／正式建置通過（lint無錯誤，13項既有standalone警告）。一次獨立審查發現的Important已以4個紅→綠案例修復：延遲品牌／類型校正失效ID不再清掉價格草稿與錯誤。原延期Minor（手動收合後未必重新展開）已於2026-11-16以原生toggle同步修復。紀錄見 `docs/superpowers/plans/2026-11-15-price-range-filter.md`；未部署。

瀏覽器測試：2026-11-16起以 `npm run e2e:browser`（Playwright 1.65.1／Chromium 1255，實際API＋暫存SQLite）在桌面1280px與375px驗證價格流程、Enter／Tab、歷史導航及無水平溢出（紀錄見 `docs/superpowers/plans/2026-11-16-browser-e2e.md`）；同日補上收藏、最近瀏覽、比較、購物車的瀏覽器流程：重新整理保留／清空、導覽計數、比較3件上限且不寫storage、購物車小數金額，以及375px四頁無溢出與比較表格鍵盤捲動（紀錄見 `docs/superpowers/plans/2026-11-16-shopping-tools-e2e.md`）。讀屏朗讀、正式站、儲存失敗與商品下架等錯誤注入情境的瀏覽器流程仍NOT RUN。

## Approved Cart Rules

使用者已批准且本機已實作每商品 1–99 件、錯誤時保留項目且不顯示完整總額、儲存失敗時降級為記憶體操作；完整行為見 `docs/superpowers/specs/2026-11-12-browser-cart-design.md`。未包含部署或付款流程。
