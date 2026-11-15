import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { AppRoutingModule } from '../app-routing.module';
import { FavoriteToggleComponent } from '../favorites/favorite-toggle.component';
import { ComparisonToggleComponent } from '../comparison/comparison-toggle.component';
import { IProduct } from '../models/product';
import { NotFoundComponent } from '../not-found.component';
import { ProductDetailComponent } from '../shop/product-detail.component';
import { ProductImageComponent } from '../shop/product-image.component';
import { TwdPricePipe } from '../shop/twd-price.pipe';
import { RecentViewsService } from './recent-views.service';
import { RecentlyViewedComponent } from './recently-viewed.component';

describe('RecentlyViewedComponent', () => {
  const key = 'skinet.recently-viewed.v1';
  const board: IProduct = {
    id: 17, name: 'Angular board', description: 'Demo board', price: 19.99,
    pictureUrl: '/images/products/sb-ang1.png', productType: 'Boards', productBrand: 'Angular'
  };
  let http: HttpTestingController;
  let harness: RouterTestingHarness | undefined;

  // 使用真路由、儲存服務與商品服務，只替換HTTP傳輸。
  beforeEach(() => {
    harness = undefined;
    localStorage.removeItem(key);
    TestBed.configureTestingModule({
      declarations: [
        RecentlyViewedComponent, NotFoundComponent, ProductDetailComponent,
        FavoriteToggleComponent, ComparisonToggleComponent, ProductImageComponent, TwdPricePipe
      ],
      imports: [AppRoutingModule, RouterModule],
      providers: [provideZoneChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  // 清除掛載DOM與自己的key，取消未完成查詢後驗證HTTP。
  afterEach(() => {
    harness?.fixture.destroy();
    harness?.fixture.nativeElement.remove();
    http.verify();
    vi.restoreAllMocks();
    localStorage.removeItem(key);
  });

  // service初始化前提供儲存fixture，模擬直接開啟紀錄頁。
  async function open(ids: readonly number[] = [], raw?: string): Promise<void> {
    localStorage.setItem(key, raw ?? JSON.stringify({ version: 1, productIds: ids }));
    harness = await RouterTestingHarness.create('/recently-viewed');
    document.body.appendChild(harness.fixture.nativeElement);
    harness.fixture.detectChanges();
  }

  // 取得目前紀錄頁DOM，不隱藏路由失敗。
  function page(): HTMLElement {
    return harness!.routeNativeElement!;
  }

  // 沿正式商品查詢端點取得請求供回應或取消斷言。
  function pending(id: number) {
    return http.expectOne(`${environment.apiUrl}products/${id}`);
  }

  // 取得穩定ID列，避免依回應先後尋找商品。
  function row(id: number): HTMLElement {
    return page().querySelector<HTMLElement>(`[data-product-id="${id}"]`)!;
  }

  // 透過原生button清除並等待渲染與焦點轉移。
  async function clear(): Promise<void> {
    const button = page().querySelector<HTMLButtonElement>('.clear-history')!;
    button.focus();
    button.click();
    harness!.fixture.detectChanges();
    await harness!.fixture.whenStable();
  }

  // 沒有紀錄時不能額外請求或提供不存在項目的操作。
  it('opens the real empty history route with privacy copy and no product requests', async () => {
    await open();
    expect(TestBed.inject(Router).url).toBe('/recently-viewed');
    expect(document.title).toBe('最近瀏覽 | SkiNet');
    expect(page().textContent).toContain('尚無最近瀏覽的商品');
    expect(page().textContent).toContain('僅在此瀏覽器保留最近12件商品，可隨時清除；共用裝置上的其他使用者也可能看到。');
    expect(page().querySelector('a')!.getAttribute('href')).toBe('/shop');
    expect(page().querySelector('button')).toBeNull();
    expect(page().querySelector('app-favorite-toggle')).toBeNull();
    expect(page().textContent).not.toContain('加入購物車');
    http.expectNone(request => request.url.includes('products'));
  });

  // 查詢回應亂序不能改變紀錄或將價格存入本機。
  it('renders fresh data in stored order without recording display requests', async () => {
    await open([17, 2]);
    const raw = localStorage.getItem(key);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(row(17).textContent).toContain('正在載入');
    pending(2).flush({ ...board, id: 2, price: 100 });
    pending(17).flush(board);
    harness!.fixture.detectChanges();
    expect([...page().querySelectorAll('[data-product-id]')].map(element => element.getAttribute('data-product-id')))
      .toEqual(['17', '2']);
    expect(row(17).textContent).toContain('NT$19.99');
    expect(row(2).textContent).toContain('NT$100');
    expect(row(17).textContent).toContain('Angular');
    expect(row(17).textContent).toContain('Boards');
    expect(row(17).querySelector('a')!.getAttribute('href')).toBe('/shop/17');
    expect(row(17).querySelector('app-product-image')).not.toBeNull();
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([17, 2]);
    expect(localStorage.getItem(key)).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(page().querySelectorAll('[role="status"]').length).toBe(1);
  });

  // 重試僅查失敗列且保留被聚焦的同一標題節點。
  it('retains unavailable products and retries only failed rows with stable focus', async () => {
    await open([17, 2]);
    const raw = localStorage.getItem(key);
    pending(17).flush({}, { status: 404, statusText: 'Not found' });
    pending(2).flush({}, { status: 500, statusText: 'Failed' });
    harness!.fixture.detectChanges();
    expect(row(17).textContent).toContain('已無法取得');
    expect(row(17).querySelector('button')).toBeNull();
    expect(row(2).textContent).toContain('載入失敗');
    const title = row(2).querySelector<HTMLElement>('.recent-product-title')!;
    const retry = row(2).querySelector<HTMLButtonElement>('.retry-product')!;
    expect(retry.closest('a')).toBeNull();
    expect(retry.type).toBe('button');
    retry.focus();
    retry.click();
    harness!.fixture.detectChanges();
    expect(document.activeElement).toBe(title);
    expect(title.textContent).toContain('2');
    const request = pending(2);
    (harness!.routeDebugElement!.componentInstance as RecentlyViewedComponent).retryProduct(2);
    http.expectNone(`${environment.apiUrl}products/2`);
    http.expectNone(`${environment.apiUrl}products/17`);
    request.flush({ ...board, id: 2 });
    harness!.fixture.detectChanges();
    expect(row(2).querySelector('.recent-product-title')).toBe(title);
    expect(document.activeElement).toBe(title);
    expect(row(2).textContent).toContain(board.name);
    expect(row(17).textContent).toContain('已無法取得');
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([17, 2]);
    expect(localStorage.getItem(key)).toBe(raw);
  });

  // 清除途中請求必須取消，不能在空狀態中復活。
  it('clears loading rows, cancels requests and focuses the empty state', async () => {
    await open([17, 2]);
    const requests = [pending(17), pending(2)];
    expect(page().querySelector<HTMLButtonElement>('.clear-history')!.type).toBe('button');
    await clear();
    expect(requests.every(request => request.cancelled)).toBe(true);
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
    expect(page().querySelector('[data-product-id]')).toBeNull();
    expect(page().querySelector('.clear-history')).toBeNull();
    expect(document.activeElement?.id).toBe('empty-recently-viewed-title');
    expect(page().querySelectorAll('[role="status"]').length).toBe(1);
    expect(page().querySelector('[role="status"]')!.textContent).toContain('已清除瀏覽紀錄');
    http.expectNone(request => request.url.includes('products'));
  });

  // 已進入第二次請求的商品也須被清除取消。
  it('cancels a retry in progress when clearing history', async () => {
    await open([17]);
    pending(17).flush({}, { status: 500, statusText: 'Failed' });
    harness!.fixture.detectChanges();
    page().querySelector<HTMLButtonElement>('.retry-product')!.click();
    harness!.fixture.detectChanges();
    const retry = pending(17);
    await clear();
    expect(retry.cancelled).toBe(true);
    expect(page().querySelector('[data-product-id]')).toBeNull();
    http.expectNone(request => request.url.includes('products'));
  });

  // 儲存移除被拒時不能將記憶體清除說成完整刪除。
  it('keeps the warning visible after a failed persisted deletion without success feedback', async () => {
    await open([17]);
    pending(17).flush(board);
    harness!.fixture.detectChanges();
    const raw = localStorage.getItem(key);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    await clear();
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([]);
    expect(localStorage.getItem(key)).toBe(raw);
    expect(page().textContent).toContain('尚無最近瀏覽的商品');
    expect(page().textContent).toContain('已清除本次紀錄，但無法清除瀏覽器儲存資料，重新整理後可能再次出現');
    expect(page().textContent).not.toContain('已清除瀏覽紀錄');
    expect(page().querySelector('.clear-history')).toBeNull();
    expect(document.activeElement?.id).toBe('empty-recently-viewed-title');
    expect(page().querySelectorAll('[role="status"]').length).toBe(1);
  });

  // 空清單不代表沒有警告，損壞資料需能理解原因。
  it('shows unreadable-storage warnings even when history is empty', async () => {
    await open([], '{');
    expect(page().textContent).toContain('儲存的瀏覽紀錄無法讀取，已使用空清單');
    expect(page().textContent).toContain('尚無最近瀏覽的商品');
    http.expectNone(request => request.url.includes('products'));
  });

  // 寫入降級訊息在紀錄頁仍應可見，不能誤報已保存。
  it('shows session-only storage warnings on the history page', async () => {
    const recent = TestBed.inject(RecentViewsService);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    recent.record(17);
    vi.restoreAllMocks();
    harness = await RouterTestingHarness.create('/recently-viewed');
    pending(17).flush(board);
    harness.fixture.detectChanges();
    expect(page().querySelector('[role="status"]')!.textContent)
      .toContain('瀏覽紀錄暫時無法儲存，重新整理後可能遺失');
    expect(row(17).textContent).toContain(board.name);
  });

  // 離頁應釋放HTTP訂閱，而非任由查詢留在背景。
  it('cancels pending queries on navigation away', async () => {
    await open([17]);
    const request = pending(17);
    await harness!.navigateByUrl('/missing');
    expect(request.cancelled).toBe(true);
  });

  // 只有真正開啟詳情才重排，返回紀錄頁重查資料不得再重排。
  it('records detail visits but not history queries on a return visit', async () => {
    await open([17, 2]);
    pending(17).flush(board);
    pending(2).flush({ ...board, id: 2 });
    harness!.fixture.detectChanges();
    const href = row(2).querySelector('a')!.getAttribute('href')!;
    await harness!.navigateByUrl(href);
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([17, 2]);
    pending(2).flush({ ...board, id: 2 });
    harness!.fixture.detectChanges();
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([2, 17]);
    expect(page().querySelector('.back-link')!.getAttribute('href')).toBe('/shop');
    await harness!.navigateByUrl('/recently-viewed');
    const raw = localStorage.getItem(key);
    pending(17).flush({ ...board, price: 25 });
    pending(2).flush({ ...board, id: 2 });
    harness!.fixture.detectChanges();
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([2, 17]);
    expect(localStorage.getItem(key)).toBe(raw);
    expect(row(17).textContent).toContain('NT$25');
  });
});
