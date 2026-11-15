import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { AppRoutingModule } from '../app-routing.module';
import { IProduct } from '../models/product';
import { NotFoundComponent } from '../not-found.component';
import { RecentViewsService } from '../recently-viewed/recent-views.service';
import { ProductImageComponent } from '../shop/product-image.component';
import { TwdPricePipe } from '../shop/twd-price.pipe';
import { ComparisonComponent } from './comparison.component';
import { ComparisonService } from './comparison.service';

describe('ComparisonComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness | undefined;
  const board: IProduct = {
    id: 17, name: 'Angular board', description: 'Demo board', price: 19.99,
    pictureUrl: '/images/products/sb-ang1.png', productType: 'Boards', productBrand: 'Angular'
  };
  const keys = ['skinet.cart.v1', 'skinet.favorites.v1', 'skinet.recently-viewed.v1'];
  let originals: (string | null)[];

  // 真選取服務與正式路由，僅將HTTP替換為傳輸測試邊界。
  beforeEach(() => {
    harness = undefined;
    originals = keys.map(key => localStorage.getItem(key));
    localStorage.setItem(keys[0], '{"version":1,"items":[{"productId":17,"quantity":2}]}');
    localStorage.setItem(keys[1], '{"version":1,"productIds":[2]}');
    localStorage.setItem(keys[2], '{"version":1,"productIds":[2,17]}');
    TestBed.configureTestingModule({
      declarations: [ComparisonComponent, NotFoundComponent, ProductImageComponent, TwdPricePipe],
      imports: [AppRoutingModule, RouterModule],
      providers: [provideZoneChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  // 取消頁面訂閱並還原原始資料，避免清除其他功能的儲存。
  afterEach(() => {
    harness?.fixture.destroy();
    harness?.fixture.nativeElement.remove();
    http.verify();
    keys.forEach((key, index) => {
      const original = originals[index];
      if (original === null) localStorage.removeItem(key);
      else localStorage.setItem(key, original);
    });
  });

  // 透過真service選取，未使用URL或儲存fixture建立比較清單。
  async function open(ids: readonly number[] = []): Promise<void> {
    for (const id of ids) TestBed.inject(ComparisonService).toggle(id);
    harness = await RouterTestingHarness.create('/compare');
    document.body.appendChild(harness.fixture.nativeElement);
    harness.fixture.detectChanges();
  }

  // 明確取得比較頁，路由錯誤會直接顯示於測試。
  function page(): HTMLElement {
    return harness!.routeNativeElement!;
  }

  // 每欄以表頭ID定位，不能依全頁任意出現的相同文字判斷。
  function header(id: number): HTMLElement {
    return page().querySelector<HTMLElement>(`thead th[data-product-id="${id}"]`)!;
  }

  // 取得欄位與商品交會儲存格，驗證資料沒有串欄。
  function cell(field: string, id: number): HTMLElement {
    return page().querySelector<HTMLElement>(`[data-field="${field}"] td[data-product-id="${id}"]`)!;
  }

  // 僅回應正式既有商品端點。
  function pending(id: number) {
    return http.expectOne(`${environment.apiUrl}products/${id}`);
  }

  // 點擊移除並等待下一次渲染的焦點轉移。
  async function remove(id: number): Promise<void> {
    const button = header(id).querySelector<HTMLButtonElement>('.remove-comparison')!;
    button.focus();
    button.click();
    harness!.fixture.detectChanges();
    await harness!.fixture.whenStable();
  }

  // 點擊清空控制，操作焦點不能留在消失的按鈕上。
  async function clear(): Promise<void> {
    const button = page().querySelector<HTMLButtonElement>('.clear-comparison')!;
    button.focus();
    button.click();
    harness!.fixture.detectChanges();
    await harness!.fixture.whenStable();
  }

  // 空清單不能發出查詢或呈現假的比較資料。
  it('opens the empty comparison route without product queries', async () => {
    await open();
    expect(TestBed.inject(Router).url).toBe('/compare');
    expect(document.title).toBe('商品比較 | SkiNet');
    expect(page().textContent).toContain('尚未選擇比較商品');
    expect(page().textContent).toContain('最多比較3件商品；比較清單僅限本次操作，重新整理後會清空。');
    expect(page().querySelector('a')!.getAttribute('href')).toBe('/shop');
    expect(page().querySelector('table, button')).toBeNull();
    http.expectNone(request => request.url.includes('products'));
  });

  // 僅一件時不能隱藏已選商品，而應提示繼續選取。
  it('shows one selected product with an invitation to add another', async () => {
    await open([17]);
    pending(17).flush(board);
    harness!.fixture.detectChanges();
    expect(page().textContent).toContain('再選擇一件商品，方便並排比較');
    expect(cell('price', 17).textContent).toContain('NT$19.99');
    expect(page().querySelector('table')).not.toBeNull();
    expect(page().querySelector('app-favorite-toggle, .add-to-cart')).toBeNull();
    expect(page().querySelector('[role="status"], [aria-live]')).toBeNull();
  });

  // 回應逆序不能交換商品欄或把同一筆資料複製到其他欄。
  it('keeps semantic columns aligned with out-of-order API responses', async () => {
    await open([17, 2, 3]);
    const longName = '可辨識的長商品名稱'.repeat(12);
    const longDescription = '完整介紹不得被截斷。'.repeat(50);
    pending(3).flush({ ...board, id: 3, price: 300, productBrand: 'Third', productType: 'Boots' });
    pending(2).flush({ ...board, id: 2, price: 100, productBrand: 'Second' });
    pending(17).flush({ ...board, name: longName, description: longDescription });
    harness!.fixture.detectChanges();
    expect([...page().querySelectorAll('thead th[data-product-id]')].map(element =>
      element.getAttribute('data-product-id'))).toEqual(['17', '2', '3']);
    expect(header(17).querySelector('a')!.textContent).toBe(longName);
    expect(header(17).querySelector('a')!.getAttribute('href')).toBe('/shop/17');
    expect(cell('price', 17).textContent).toContain('NT$19.99');
    expect(cell('price', 2).textContent).toContain('NT$100');
    expect(cell('price', 3).textContent).toContain('NT$300');
    expect(cell('brand', 2).textContent!.trim()).toBe('Second');
    expect(cell('brand', 3).textContent!.trim()).toBe('Third');
    expect(cell('type', 3).textContent!.trim()).toBe('Boots');
    expect(cell('description', 17).textContent!.trim()).toBe(longDescription);
    expect(cell('image', 17).querySelector('app-product-image')).not.toBeNull();
    expect([...page().querySelectorAll('tbody tr')].map(element => element.getAttribute('data-field')))
      .toEqual(['image', 'price', 'brand', 'type', 'description']);
    for (const th of page().querySelectorAll('thead th')) expect(th.getAttribute('scope')).toBe('col');
    for (const th of page().querySelectorAll('tbody th')) expect(th.getAttribute('scope')).toBe('row');
    const scroll = page().querySelector<HTMLElement>('.comparison-scroll')!;
    expect(scroll.getAttribute('role')).toBe('region');
    expect(scroll.tabIndex).toBe(0);
    expect(scroll.getAttribute('aria-labelledby')).toBe(page().querySelector('caption')!.id);
    expect(page().textContent).toContain('可左右捲動比較商品');
    expect(page().querySelector('[role="grid"]')).toBeNull();
  });

  // 未取得的價格不能當零，且重試不能影響其他商品或移除焦點標題。
  it('retains failed columns and retries only errors with stable title focus', async () => {
    await open([17, 2, 3]);
    pending(17).flush(board);
    pending(2).flush({}, { status: 404, statusText: 'Not found' });
    pending(3).flush({}, { status: 500, statusText: 'Failed' });
    harness!.fixture.detectChanges();
    expect(header(2).textContent).toContain('商品 #2 已無法取得');
    expect(header(2).querySelector('.retry-product')).toBeNull();
    expect(header(3).textContent).toContain('載入失敗');
    for (const id of [2, 3]) {
      expect(cell('price', id).textContent!.trim()).toBe('—');
      expect(header(id).querySelector('.remove-comparison')).not.toBeNull();
    }
    const title = header(3).querySelector<HTMLElement>('.comparison-product-title')!;
    expect(title.tabIndex).toBe(-1);
    const retry = header(3).querySelector<HTMLButtonElement>('.retry-product')!;
    expect(retry.type).toBe('button');
    retry.focus();
    retry.click();
    harness!.fixture.detectChanges();
    expect(document.activeElement).toBe(title);
    expect(title.textContent).toContain('3');
    const request = pending(3);
    (harness!.routeDebugElement!.componentInstance as ComparisonComponent).retryProduct(3);
    http.expectNone(request => request.url.includes('products'));
    request.flush({ ...board, id: 3, price: 45 });
    harness!.fixture.detectChanges();
    expect(header(3).querySelector('.comparison-product-title')).toBe(title);
    expect(document.activeElement).toBe(title);
    expect(cell('price', 3).textContent).toContain('NT$45');
    expect(TestBed.inject(ComparisonService).productIds()).toEqual([17, 2, 3]);
  });

  // 下一欄與上一欄必須以原選取位置決定，不能跳到已移除控制。
  it('moves focus to next column, previous column, then empty heading on removal', async () => {
    await open([17, 2, 3]);
    for (const id of [17, 2, 3]) pending(id).flush({ ...board, id });
    harness!.fixture.detectChanges();
    await remove(2);
    expect(document.activeElement).toBe(header(3).querySelector('.remove-comparison'));
    await remove(3);
    expect(document.activeElement).toBe(header(17).querySelector('.remove-comparison'));
    await remove(17);
    expect(document.activeElement?.id).toBe('empty-comparison-title');
    expect(page().querySelector('table')).toBeNull();
    expect(TestBed.inject(ComparisonService).count()).toBe(0);
    http.expectNone(request => request.url.includes('products'));
  });

  // 初次與重試請求遇到移除或清空皆須取消，保留欄不能被重查。
  it.each([
    { retrying: false, clearing: false }, { retrying: true, clearing: false },
    { retrying: false, clearing: true }, { retrying: true, clearing: true }
  ])('cancels pending queries for action %j', async ({ retrying, clearing }) => {
    await open([17, 2]);
    const initial = pending(17);
    const retained = pending(2);
    if (retrying) {
      initial.flush({}, { status: 500, statusText: 'Failed' });
      harness!.fixture.detectChanges();
      header(17).querySelector<HTMLButtonElement>('.retry-product')!.click();
      harness!.fixture.detectChanges();
    }
    const request = retrying ? pending(17) : initial;
    if (clearing) await clear();
    else await remove(17);
    expect(request.cancelled).toBe(true);
    expect(header(17)).toBeNull();
    if (clearing) {
      expect(retained.cancelled).toBe(true);
      expect(document.activeElement?.id).toBe('empty-comparison-title');
    } else {
      retained.flush({ ...board, id: 2 });
      harness!.fixture.detectChanges();
      expect(cell('price', 2).textContent).toContain('NT$19.99');
    }
    http.expectNone(request => request.url.includes('products'));
  });

  // 返回同頁應重取資料而不是使用跨頁價格快取。
  it('cancels on leaving and refreshes product data on a return visit', async () => {
    await open([17, 2]);
    const first = pending(17);
    const second = pending(2);
    await harness!.navigateByUrl('/missing');
    expect(first.cancelled).toBe(true);
    expect(second.cancelled).toBe(true);
    await harness!.navigateByUrl('/compare');
    pending(2).flush({ ...board, id: 2, price: 250 });
    pending(17).flush(board);
    harness!.fixture.detectChanges();
    expect(cell('price', 2).textContent).toContain('NT$250');
    expect(TestBed.inject(ComparisonService).productIds()).toEqual([17, 2]);
  });

  // 顯示、重試、移除與清空均不能改動最近瀏覽或其他選品資料。
  it('leaves cart, favorites and recent history untouched by comparison operations', async () => {
    const recent = TestBed.inject(RecentViewsService);
    const raw = keys.map(key => localStorage.getItem(key));
    await open([17, 2]);
    pending(17).flush(board);
    pending(2).flush({}, { status: 500, statusText: 'Failed' });
    harness!.fixture.detectChanges();
    header(2).querySelector<HTMLButtonElement>('.retry-product')!.click();
    pending(2).flush({ ...board, id: 2 });
    harness!.fixture.detectChanges();
    await remove(17);
    await clear();
    expect(recent.productIds()).toEqual([2, 17]);
    expect(keys.map(key => localStorage.getItem(key))).toEqual(raw);
    expect(TestBed.inject(Router).url).toBe('/compare');
  });
});
