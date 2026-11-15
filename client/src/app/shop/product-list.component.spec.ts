import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter, Router, RouterModule } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { IProduct } from '../models/product';
import { NotFoundComponent } from '../not-found.component';
import { ProductImageComponent } from './product-image.component';
import { ProductListComponent } from './product-list.component';
import { TwdPricePipe } from './twd-price.pipe';
import { FavoriteToggleComponent } from '../favorites/favorite-toggle.component';
import { FavoritesService } from '../favorites/favorites.service';
import { CartService } from '../cart/cart.service';
import { RecentViewsService } from '../recently-viewed/recent-views.service';
import { ComparisonToggleComponent } from '../comparison/comparison-toggle.component';
import { ComparisonService } from '../comparison/comparison.service';

describe('ProductListComponent', () => {
  let http: HttpTestingController;
  let router: Router;
  let harness: RouterTestingHarness;

  const routes = [
    { path: '', redirectTo: 'shop', pathMatch: 'full' as const },
    { path: 'shop', component: ProductListComponent },
    { path: '**', component: NotFoundComponent },
  ];

  beforeEach(async () => {
    localStorage.removeItem('skinet.favorites.v1');
    localStorage.setItem('skinet.recently-viewed.v1', '{"version":1,"productIds":[2,7]}');
    TestBed.configureTestingModule({
      declarations: [ProductListComponent, NotFoundComponent, ProductImageComponent, TwdPricePipe, FavoriteToggleComponent, ComparisonToggleComponent],
      imports: [FormsModule, RouterModule],
      providers: [
        provideZoneChangeDetection(),
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('skinet.favorites.v1');
    localStorage.removeItem('skinet.recently-viewed.v1');
  });

  // 建立列表並等待初始查詢完成，讓測試能直接斷言畫面狀態。
  async function openList(url = '/shop'): Promise<ProductListComponent> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeDebugElement!.componentInstance as ProductListComponent;
  }

  // 回覆兩個獨立載入的篩選選項請求。
  function flushLookups(
    brands: { id: number; name: string }[] = [{ id: 1, name: 'Angular' }],
    types: { id: number; name: string }[] = [{ id: 1, name: 'Boards' }],
  ): void {
    http
      .expectOne(
        candidate =>
          candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products/brands`,
      )
      .flush(brands);
    http
      .expectOne(
        candidate =>
          candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products/types`,
      )
      .flush(types);
  }

  // 以固定六件規模產生一頁假商品，讓 count 與頁碼可預期。
  function page(pageIndex: number, count: number, data: IProduct[] = []): object {
    return { pageIndex, pageSize: 6, count, data };
  }

  // 找出尚未回應的商品列表請求。
  function pendingProducts() {
    return http.expectOne(
      candidate => candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products`,
    );
  }

  // 建立一筆可辨識的商品，供列表渲染斷言使用。
  function product(id: number, name: string): IProduct {
    return {
      id,
      name,
      description: 'Snow gear',
      price: 120,
      pictureUrl: '/images/products/sb-ang1.png',
      productType: 'Boards',
      productBrand: 'Angular',
    };
  }

  // 從實際價格輸入邊界送出草稿，不直接修改元件內部狀態。
  async function enterPrices(min: string, max: string, submit = true): Promise<void> {
    harness.fixture.detectChanges();
    for (const [name, value] of [['minPrice', min], ['maxPrice', max]]) {
      const input = harness.routeNativeElement!.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await harness.fixture.whenStable();
    if (submit) {
      harness.routeNativeElement!.querySelector('form.price-form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await harness.fixture.whenStable();
    }
    harness.fixture.detectChanges();
  }

  // 手動收合後原生狀態須同步，否則再次強制展開不會改變綁定。
  it('reopensFiltersAfterManualCollapse', async () => {
    await openList();
    flushLookups();
    pendingProducts().flush(page(1, 12));
    harness.fixture.detectChanges();
    const details = harness.routeNativeElement!.querySelector('details')!;
    details.open = false;
    await new Promise(resolve => details.addEventListener('toggle', resolve, { once: true }));
    harness.fixture.detectChanges();
    await router.navigateByUrl('/shop?minPrice=bad');
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(details.open).toBe(true);
    http.expectNone(request => request.url === `${environment.apiUrl}products`);

    await router.navigateByUrl('/shop');
    pendingProducts().flush(page(1, 12));
    harness.fixture.detectChanges();
    details.open = false;
    await new Promise(resolve => details.addEventListener('toggle', resolve, { once: true }));
    harness.fixture.detectChanges();
    await enterPrices('20.01', '20');
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(
      harness.routeNativeElement!.querySelector('[name="minPrice"]'),
    );
  });

  // 草稿不能混入請求或詳情；送出才保留其他條件並回第一頁。
  it('keepsPriceDraftSeparateUntilSubmit', async () => {
    await openList('/shop?search=Angular&brandId=1&typeId=1&sort=priceAsc&pageIndex=2&minPrice=0');
    flushLookups();
    pendingProducts().flush(page(2, 12, [product(7, 'Applied board')]));
    const url = router.url;
    await enterPrices('19.99', '200.01', false);
    expect(router.url).toBe(url);
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
    const href = harness.routeNativeElement!.querySelector('.product-link')!.getAttribute('href')!;
    expect(new URLSearchParams(href.split('?')[1]).get('minPrice')).toBe('0');
    expect(new URLSearchParams(href.split('?')[1]).has('maxPrice')).toBe(false);
    await enterPrices('19.99', '200.01');
    expect(Object.fromEntries(new URLSearchParams(router.url.split('?')[1]))).toEqual({
      search: 'Angular', brandId: '1', typeId: '1', sort: 'priceAsc',
      minPrice: '19.99', maxPrice: '200.01',
    });
    const request = pendingProducts();
    expect(request.request.params.get('minPrice')).toBe('19.99');
    expect(request.request.params.get('maxPrice')).toBe('200.01');
    expect(request.request.params.get('pageIndex')).toBe('1');
    request.flush(page(1, 1, [product(7, 'Applied board')]));
  });

  // 無效草稿保留舊結果，錯誤只在提交後顯示，且與欄位及焦點相連。
  it('keepsAppliedResultsWhenDraftIsInvalid', async () => {
    await openList('/shop?minPrice=0');
    flushLookups();
    pendingProducts().flush(page(1, 1, [product(7, 'Keep this board')]));
    await enterPrices('20.01', '20', false);
    expect(harness.routeNativeElement!.querySelector('[aria-invalid="true"]')).toBeNull();
    await enterPrices('20.01', '20');
    expect(router.url).toBe('/shop?minPrice=0');
    expect(harness.routeNativeElement!.textContent).toContain('Keep this board');
    expect(harness.routeNativeElement!.textContent).toContain('價格尚未套用');
    const input = harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('min-price-error');
    expect(document.activeElement).toBe(input);
    expect(harness.routeNativeElement!.querySelector('#min-price-error')!.textContent)
      .toContain('最低價格不可高於最高價格');
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
  });

  // 非法網址必須清除舊結果並取消請求，任何列表操作都不能繞過。
  it('blocksAndCancelsProductsForInvalidPriceUrl', async () => {
    const component = await openList('/shop?minPrice=0');
    const old = pendingProducts();
    await router.navigateByUrl('/shop?minPrice=1e2&maxPrice=20&pageIndex=2');
    await harness.fixture.whenStable();
    expect(old.cancelled).toBe(true);
    flushLookups();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(router.url).toContain('minPrice=1e2');
    expect(component.products).toEqual([]);
    expect(component.count).toBe(0);
    expect(component.loading).toBe(false);
    expect(component.error).toBe(false);
    expect(harness.routeNativeElement!.querySelector('details')!.open).toBe(true);
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe('1e2');
    expect(harness.routeNativeElement!.querySelector('.result-count')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.pagination')).toBeNull();
    component.retryProducts();
    component.searchTerm = 'other';
    component.submitSearch();
    component.setFilter('brandId', 1);
    component.setSort('priceDesc');
    component.goToPage(2);
    await harness.fixture.whenStable();
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
    expect(router.url).toContain('minPrice=1e2');
  });

  // 修正非法網址才恢復查詢，清除價格保留其他條件；清除全部移除所有條件。
  it('recoversInvalidUrlBySubmitOrClear', async () => {
    const component = await openList('/shop?search=Angular&sort=priceAsc&minPrice=1e2&pageIndex=2');
    flushLookups();
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
    await enterPrices('19.99', '200');
    expect(router.url).not.toContain('pageIndex');
    pendingProducts().flush(page(1, 12));
    harness.fixture.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.clear-prices')!.click();
    await harness.fixture.whenStable();
    expect(Object.fromEntries(new URLSearchParams(router.url.split('?')[1])))
      .toEqual({ search: 'Angular', sort: 'priceAsc' });
    pendingProducts().flush(page(1, 12));
    await router.navigateByUrl('/shop?minPrice=bad&brandId=1');
    await harness.fixture.whenStable();
    component.clearFilters();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/shop');
    pendingProducts().flush(page(1, 18));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe('');
    expect(harness.routeNativeElement!.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  // 合法價格正規化只替換網址，不丟失分頁；歷史狀態需還原控制與請求。
  it('normalizesPriceUrlWithoutChangingPageAndRestoresHistory', async () => {
    await openList('/shop?minPrice=0019.90&maxPrice=200.00&pageIndex=2');
    flushLookups();
    await harness.fixture.whenStable();
    const initial = pendingProducts();
    expect(initial.request.params.get('pageIndex')).toBe('2');
    expect(initial.request.params.get('minPrice')).toBe('19.9');
    initial.flush(page(2, 12));
    expect(router.url).toContain('minPrice=19.9');
    await router.navigateByUrl('/shop?minPrice=0');
    pendingProducts().flush(page(1, 12));
    await router.navigateByUrl('/shop?minPrice=19.9&maxPrice=200&pageIndex=2');
    const restored = pendingProducts();
    expect(restored.request.params.get('maxPrice')).toBe('200');
    expect(restored.request.params.get('pageIndex')).toBe('2');
    restored.flush(page(2, 12));
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe('19.9');
    await router.navigateByUrl(router.url);
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
  });

  // 選項完成不應擦除草稿；真正切換條件時才還原已套用價格。
  it('doesNotResetDraftWhenLookupsFinish', async () => {
    const component = await openList('/shop?minPrice=0');
    pendingProducts().flush(page(1, 12));
    await enterPrices('19.99', '200', false);
    flushLookups();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe('19.99');
    component.setSort('priceDesc');
    await harness.fixture.whenStable();
    const request = pendingProducts();
    expect(request.request.params.get('minPrice')).toBe('0');
    expect(request.request.params.has('maxPrice')).toBe(false);
    request.flush(page(1, 12));
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe('0');
  });

  // 延遲選項移除失效 ID 及其 replaceUrl，都不能丟失草稿或已顯示錯誤。
  it.each([
    ['brandId', false], ['typeId', false], ['brandId', true], ['typeId', true],
  ] as const)('preserves price drafts when delayed %s corrects an invalid ID (error=%s)', async (key, invalid) => {
    const component = await openList(`/shop?${key}=999&minPrice=0`);
    pendingProducts().flush(page(1, 12));
    const min = invalid ? 'bad' : '19.99';
    await enterPrices(min, '200', invalid);
    expect(component.priceNotApplied).toBe(invalid);
    const errors = { ...component.priceErrors };

    flushLookups();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    const request = pendingProducts();
    expect(router.url).toBe('/shop?minPrice=0');
    expect(component.query[key]).toBeNull();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe(min);
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="maxPrice"]')!.value).toBe('200');
    expect(component.priceErrors).toEqual(errors);
    expect(component.priceNotApplied).toBe(invalid);
    expect(request.request.params.has(key)).toBe(false);
    expect(request.request.params.get('minPrice')).toBe('0');
    expect(request.request.params.has('maxPrice')).toBe(false);
    request.flush(page(1, 12));
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
  });

  // 同網址送出與清除依然更新表單，但不得重複發送商品查詢。
  it('resetsDraftWithoutDependingOnNavigationEvent', async () => {
    await openList();
    flushLookups();
    pendingProducts().flush(page(1, 12));
    await enterPrices('bad', '');
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.clear-prices')!.click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('[name="minPrice"]')!.value).toBe('');
    expect(harness.routeNativeElement!.textContent).not.toContain('價格尚未套用');
    await enterPrices('000.00', '');
    pendingProducts().flush(page(1, 12));
    await enterPrices('bad', '');
    await enterPrices('0', '');
    expect(harness.routeNativeElement!.querySelector('[aria-invalid="true"]')).toBeNull();
    http.expectNone(request => request.url === `${environment.apiUrl}products`);
  });

  // 網路重試及越界頁碼修正需保留價格，不能把價格錯誤當成載入失敗。
  it('keepsPriceRangeOnRetryAndPageCorrection', async () => {
    const component = await openList('/shop?minPrice=19.99&maxPrice=200&pageIndex=9');
    flushLookups();
    pendingProducts().flush('boom', { status: 500, statusText: 'Failed' });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('商品載入失敗');
    component.retryProducts();
    const retry = pendingProducts();
    expect(retry.request.params.get('minPrice')).toBe('19.99');
    retry.flush(page(9, 7));
    await harness.fixture.whenStable();
    const corrected = pendingProducts();
    expect(corrected.request.params.get('pageIndex')).toBe('2');
    expect(corrected.request.params.get('minPrice')).toBe('19.99');
    expect(corrected.request.params.get('maxPrice')).toBe('200');
    corrected.flush(page(2, 7));
  });

  // 比較按鈕不得導頁、重查、變更query或其他選品資料。
  it('compares from the list without navigation, refetching or changes to other selections', async () => {
    await openList('/shop?search=Angular&brandId=1&typeId=1&sort=priceAsc&pageIndex=2');
    flushLookups();
    pendingProducts().flush(page(2, 12, [product(7, 'Angular board')]));
    harness.fixture.detectChanges();
    const url = router.url;
    const keys = ['skinet.cart.v1', 'skinet.favorites.v1', 'skinet.recently-viewed.v1'];
    const raw = keys.map(key => localStorage.getItem(key));
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('app-comparison-toggle button')!;
    expect(button).not.toBeNull();
    expect(button.closest('a')).toBeNull();
    button.click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(TestBed.inject(ComparisonService).productIds()).toEqual([7]);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(router.url).toBe(url);
    expect(keys.map(key => localStorage.getItem(key))).toEqual(raw);
    http.expectNone(request => request.url.includes('products'));
    const href = harness.routeNativeElement!.querySelector('.product-link')!.getAttribute('href')!;
    expect(href.split('?')[0]).toBe('/shop/7');
    expect(Object.fromEntries(new URLSearchParams(href.split('?')[1]))).toEqual({
      search: 'Angular', brandId: '1', typeId: '1', sort: 'priceAsc', pageIndex: '2'
    });
  });

  // 收藏按鈕與詳情連結分離，切換不觸發路由或列表重新查詢。
  it('toggles a favorite without navigation, query changes, product refetches or cart changes', async () => {
    await openList('/shop?search=Angular&brandId=1&typeId=1&sort=priceAsc&pageIndex=2');
    flushLookups();
    pendingProducts().flush(page(2, 12, [product(7, 'Angular board')]));
    harness.fixture.detectChanges();
    const url = router.url;
    const cart = TestBed.inject(CartService).items();
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('app-favorite-toggle button')!;
    expect(button).not.toBeNull();
    expect(button.closest('a')).toBeNull();
    button.click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(TestBed.inject(FavoritesService).productIds()).toEqual([7]);
    expect(TestBed.inject(CartService).items()).toEqual(cart);
    expect(router.url).toBe(url);
    http.expectNone(request => request.url.includes('products'));
    const href = harness.routeNativeElement!.querySelector('.product-link')!.getAttribute('href')!;
    expect(href).toContain('/shop/7?');
    expect(new URLSearchParams(href.split('?')[1]).get('pageIndex')).toBe('2');
    expect(new URLSearchParams(href.split('?')[1]).get('search')).toBe('Angular');
  });

  it('initializes controls and the request from the url', async () => {
    const recent = TestBed.inject(RecentViewsService);
    const raw = localStorage.getItem('skinet.recently-viewed.v1');
    const component = await openList('/shop?search=Angular&pageIndex=2');
    flushLookups();

    const request = pendingProducts();
    expect(request.request.params.get('search')).toBe('Angular');
    expect(request.request.params.get('pageIndex')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('6');
    request.flush(page(2, 12, [product(7, 'Angular Speedster Board 2000')]));
    harness.fixture.detectChanges();

    expect(component.query.pageIndex).toBe(2);
    expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('input[type=search]')!.value)
      .toBe('Angular');
    expect(router.url).toContain('pageIndex=2');
    expect(harness.routeNativeElement!.querySelectorAll('h1').length).toBe(1);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toContain('商品目錄');
    expect(document.title).toBe('商品目錄 | SkiNet');
    expect(harness.routeNativeElement!.textContent).toContain('Angular Speedster Board 2000');
    expect(harness.routeNativeElement!.textContent).toContain('NT$120');
    expect(recent.productIds()).toEqual([2, 7]);
    expect(localStorage.getItem('skinet.recently-viewed.v1')).toBe(raw);
  });

  it('does not query while the search field is only being typed in', async () => {
    const component = await openList();
    flushLookups();
    pendingProducts().flush(page(1, 0));

    component.searchTerm = 'Core';
    await harness.fixture.whenStable();
    http.expectNone(
      candidate => candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products`,
    );
  });

  it('submits the trimmed search, encodes it, and returns to the first page', async () => {
    const component = await openList('/shop?pageIndex=3');
    flushLookups();
    pendingProducts().flush(page(3, 18));

    component.searchTerm = '  Core & 中文  ';
    component.submitSearch();
    await harness.fixture.whenStable();

    expect(new URLSearchParams(router.url.split('?')[1]).get('search')).toBe('Core & 中文');
    expect(router.url).not.toContain('pageIndex');
    const request = pendingProducts();
    expect(request.request.params.get('search')).toBe('Core & 中文');
    expect(request.request.params.get('pageIndex')).toBe('1');
    request.flush(page(1, 0));
  });

  it('applies a single brand and a single type filter', async () => {
    const component = await openList();
    flushLookups();
    pendingProducts().flush(page(1, 0));
    harness.fixture.detectChanges();

    component.setFilter('brandId', 1);
    await harness.fixture.whenStable();
    expect(router.url).toContain('brandId=1');
    let request = pendingProducts();
    expect(request.request.params.get('brandId')).toBe('1');
    request.flush(page(1, 0));
    harness.fixture.detectChanges();

    component.setFilter('typeId', 1);
    await harness.fixture.whenStable();
    expect(router.url).toContain('typeId=1');
    request = pendingProducts();
    expect(request.request.params.get('typeId')).toBe('1');
    request.flush(page(1, 0));
    harness.fixture.detectChanges();

    component.setFilter('brandId', null);
    await harness.fixture.whenStable();
    expect(router.url).not.toContain('brandId=');
    pendingProducts().flush(page(1, 0));
    harness.fixture.detectChanges();
  });

  it('resets the page and sort when filters are cleared', async () => {
    const component = await openList('/shop?brandId=1&sort=priceAsc&pageIndex=2');
    flushLookups();
    pendingProducts().flush(page(2, 12));

    component.clearFilters();
    await harness.fixture.whenStable();

    expect(router.url).toBe('/shop');
    const request = pendingProducts();
    expect(request.request.params.has('sort')).toBe(false);
    expect(request.request.params.has('brandId')).toBe(false);
    expect(request.request.params.get('pageIndex')).toBe('1');
    expect(component.searchTerm).toBe('');
    request.flush(page(1, 12));
  });

  it('cancels the previous product request when conditions change', async () => {
    const component = await openList();
    flushLookups();

    const oldRequest = pendingProducts();
    component.setSort('priceAsc');
    await harness.fixture.whenStable();

    expect(oldRequest.cancelled).toBe(true);
    const request = pendingProducts();
    expect(request.request.params.get('sort')).toBe('priceAsc');
    expect(request.request.params.get('pageIndex')).toBe('1');
    request.flush(page(1, 0));
    expect(router.url).toContain('sort=priceAsc');
  });

  it('keeps a selected id when its options fail, and recovers on retry', async () => {
    await openList('/shop?brandId=1');
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/brands`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/types`)
      .flush([{ id: 1, name: 'Boards' }]);

    const request = pendingProducts();
    expect(request.request.params.get('brandId')).toBe('1');
    request.flush(page(1, 0));
    harness.fixture.detectChanges();
    expect(router.url).toContain('brandId=1');
    expect(harness.routeNativeElement!.textContent).toContain('品牌選項載入失敗');

    (harness.routeNativeElement!.querySelector('.brands-retry') as HTMLButtonElement).click();
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/brands`)
      .flush([{ id: 1, name: 'Angular' }]);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.textContent).not.toContain('品牌選項載入失敗');
    expect(router.url).toContain('brandId=1');
  });

  it('removes a selected id that the loaded options do not contain', async () => {
    await openList('/shop?brandId=999');
    pendingProducts().flush(page(1, 0));

    flushLookups([{ id: 1, name: 'Angular' }], [{ id: 1, name: 'Boards' }]);
    await harness.fixture.whenStable();

    expect(router.url).toBe('/shop');
    pendingProducts().flush(page(1, 0));
  });

  it('rewrites an out-of-range page to the last page without looping', async () => {
    await openList('/shop?pageIndex=9');
    flushLookups();

    pendingProducts().flush(page(9, 7));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(router.url).toContain('pageIndex=2');
    const request = pendingProducts();
    expect(request.request.params.get('pageIndex')).toBe('2');
    request.flush(page(2, 7));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    http.expectNone(
      candidate => candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products`,
    );
    expect(router.url).toContain('pageIndex=2');
  });

  it('rewrites an empty page to the first page', async () => {
    await openList('/shop?pageIndex=4');
    flushLookups();

    pendingProducts().flush(page(4, 0));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(router.url).toBe('/shop');
    const request = pendingProducts();
    expect(request.request.params.get('pageIndex')).toBe('1');
    request.flush(page(1, 0));
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('找不到符合條件的商品');
  });

  it('clears the conditions from the empty state', async () => {
    await openList('/shop?search=none');
    flushLookups();
    pendingProducts().flush(page(1, 0));
    harness.fixture.detectChanges();

    (harness.routeNativeElement!.querySelector('.empty-clear') as HTMLButtonElement).click();
    await harness.fixture.whenStable();

    expect(router.url).toBe('/shop');
    pendingProducts().flush(page(1, 18));
    harness.fixture.detectChanges();
  });

  it('keeps the current query when retrying a failed product request', async () => {
    const component = await openList('/shop?sort=priceDesc');
    flushLookups();
    pendingProducts().flush('boom', { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('商品載入失敗');
    component.retryProducts();
    const request = pendingProducts();
    expect(request.request.params.get('sort')).toBe('priceDesc');
    request.flush(page(1, 18));
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.textContent).not.toContain('商品載入失敗');
  });

  it('restores controls and requests when the url returns to an earlier state', async () => {
    const component = await openList();
    flushLookups();
    pendingProducts().flush(page(1, 18));
    harness.fixture.detectChanges();

    component.setSort('priceDesc');
    await harness.fixture.whenStable();
    pendingProducts().flush(page(1, 18));
    harness.fixture.detectChanges();
    expect(router.url).toContain('sort=priceDesc');

    await router.navigateByUrl('/shop');
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(router.url).toBe('/shop');
    pendingProducts().flush(page(1, 18));
    harness.fixture.detectChanges();
    expect(
      harness.routeNativeElement!.querySelector<HTMLSelectElement>('select')!.value,
    ).toBe('name');
  });

  it('keeps the pagination control focused while the next page loads', async () => {
    await openList();
    flushLookups();
    pendingProducts().flush(page(1, 18));
    harness.fixture.detectChanges();

    const next = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button'),
    ).find(button => button.textContent?.trim() === '下一頁')!;
    next.focus();
    next.click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.querySelector('.pagination')).not.toBeNull();
    expect(document.activeElement).toBe(next);
    expect(next.disabled).toBe(true);
    pendingProducts().flush(page(2, 18));
    harness.fixture.detectChanges();
  });

  it('shows the not-found page with a way back for unknown client routes', async () => {
    harness = await RouterTestingHarness.create('/missing');
    const element = harness.routeNativeElement!;

    expect(element.querySelectorAll('h1').length).toBe(1);
    expect(element.textContent).toContain('找不到頁面');
    expect(document.title).toBe('找不到頁面 | SkiNet');
    expect(element.querySelector('a')!.getAttribute('href')).toBe('/shop');
  });
});
