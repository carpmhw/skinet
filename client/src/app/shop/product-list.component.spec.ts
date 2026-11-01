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
    TestBed.configureTestingModule({
      declarations: [ProductListComponent, NotFoundComponent, ProductImageComponent, TwdPricePipe],
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

  afterEach(() => http.verify());

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

  it('initializes controls and the request from the url', async () => {
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
