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
import { ProductDetailComponent } from './product-detail.component';
import { ProductImageComponent } from './product-image.component';
import { ProductListComponent } from './product-list.component';
import { TwdPricePipe } from './twd-price.pipe';
import { CartService } from '../cart/cart.service';
import { vi } from 'vitest';
import { FavoriteToggleComponent } from '../favorites/favorite-toggle.component';
import { FavoritesService } from '../favorites/favorites.service';
import { RecentViewsService } from '../recently-viewed/recent-views.service';

describe('ProductDetailComponent', () => {
  let http: HttpTestingController;
  let router: Router;
  let harness: RouterTestingHarness;

  const routes = [
    { path: '', redirectTo: 'shop', pathMatch: 'full' as const },
    { path: 'shop', component: ProductListComponent },
    { path: 'shop/:id', component: ProductDetailComponent },
    { path: '**', component: NotFoundComponent },
  ];

  const boots: IProduct = {
    id: 1,
    name: 'Angular Speedster Board 2000',
    description: 'A demonstrator board for the SkiNet catalogue.',
    price: 200,
    pictureUrl: '/images/products/sb-ang1.png',
    productType: 'Boards',
    productBrand: 'Angular',
  };

  beforeEach(async () => {
    localStorage.removeItem('skinet.recently-viewed.v1');
    localStorage.removeItem('skinet.cart.v1');
    localStorage.removeItem('skinet.favorites.v1');
    TestBed.configureTestingModule({
      declarations: [
        ProductDetailComponent,
        ProductListComponent,
        NotFoundComponent,
        ProductImageComponent,
        TwdPricePipe,
        FavoriteToggleComponent,
      ],
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

  // 清除本次購物車資料與故障注入，不影響下一個案例。
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    localStorage.removeItem('skinet.cart.v1');
    localStorage.removeItem('skinet.favorites.v1');
    localStorage.removeItem('skinet.recently-viewed.v1');
  });

  // 開啟詳情頁並回傳實際渲染的元件。
  async function openDetail(url: string): Promise<ProductDetailComponent> {
    harness = await RouterTestingHarness.create(url);
    return harness.routeDebugElement!.componentInstance as ProductDetailComponent;
  }

  // 找出尚未回應的單一商品請求。
  function pendingProduct(id: number) {
    return http.expectOne(
      candidate =>
        candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products/${id}`,
    );
  }

  // 缺少成功回應記錄會使既有ID無法前移；載入前記錄則會過早變更。
  it('records returned IDs only after successful detail responses', async () => {
    localStorage.setItem('skinet.recently-viewed.v1', '{"version":1,"productIds":[2,17]}');
    await openDetail('/shop/17');
    const recent = TestBed.inject(RecentViewsService);
    expect(recent.productIds()).toEqual([2, 17]);
    pendingProduct(17).flush({ ...boots, id: 17 });
    harness.fixture.detectChanges();
    expect(recent.productIds()).toEqual([17, 2]);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    await harness.navigateByUrl('/missing');
    await harness.navigateByUrl('/shop/17');
    pendingProduct(17).flush({ ...boots, id: 17 });
    expect(write).not.toHaveBeenCalled();
    await harness.navigateByUrl('/missing');
    await harness.navigateByUrl('/shop/17');
    pendingProduct(17).flush({ ...boots, id: 2 });
    expect(recent.productIds()).toEqual([2, 17]);
    expect(write).toHaveBeenCalledTimes(1);
    http.expectNone(request => request.url.includes('products'));
  });

  // 錯誤或取消不能變動舊紀錄，成功重試才前移。
  it.each([404, 500, 0])('retains history on failure %s and records a successful retry', async status => {
    localStorage.setItem('skinet.recently-viewed.v1', '{"version":1,"productIds":[2,17]}');
    const component = await openDetail('/shop/17');
    const request = pendingProduct(17);
    if (status === 0) request.error(new ProgressEvent('error'));
    else request.flush({}, { status, statusText: 'Failed' });
    const recent = TestBed.inject(RecentViewsService);
    expect(recent.productIds()).toEqual([2, 17]);
    component.retryProduct();
    expect(recent.productIds()).toEqual([2, 17]);
    pendingProduct(17).flush({ ...boots, id: 17 });
    expect(recent.productIds()).toEqual([17, 2]);
  });

  // 舊商品請求須在切換或離頁時取消，不能寫入瀏覽紀錄。
  it('cancels obsolete detail requests without recording them', async () => {
    const component = await openDetail('/shop/17');
    const obsolete = pendingProduct(17);
    await harness.navigateByUrl('/shop/2');
    expect(harness.routeDebugElement!.componentInstance).toBe(component);
    expect(obsolete.cancelled).toBe(true);
    pendingProduct(2).flush({ ...boots, id: 2 });
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([2]);
    await harness.navigateByUrl('/shop/3');
    const leaving = pendingProduct(3);
    await harness.navigateByUrl('/missing');
    expect(leaving.cancelled).toBe(true);
    expect(TestBed.inject(RecentViewsService).productIds()).toEqual([2]);
  });

  // 寫入錯誤不得改變詳情成功畫面或購物車、收藏操作。
  it('shows one recent-storage warning without blocking loaded product controls', async () => {
    await openDetail('/shop/17?brandId=1');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    pendingProduct(17).flush({ ...boots, id: 17 });
    harness.fixture.detectChanges();
    const element = harness.routeNativeElement!;
    expect(element.textContent).toContain('NT$200');
    expect(element.querySelectorAll('.recent-views-warning[role="status"]').length).toBe(1);
    expect(element.querySelector('.recent-views-warning')!.textContent)
      .toContain('瀏覽紀錄暫時無法儲存，重新整理後可能遺失');
    expect(element.querySelector('app-favorite-toggle button')).not.toBeNull();
    element.querySelector<HTMLButtonElement>('.add-to-cart')!.click();
    harness.fixture.detectChanges();
    expect(TestBed.inject(CartService).items()).toEqual([{ productId: 17, quantity: 1 }]);
    expect(element.querySelector('.cart-feedback')!.textContent).toContain('已加入購物車');
    expect(TestBed.inject(FavoritesService).productIds()).toEqual([]);
    expect(router.url).toBe('/shop/17?brandId=1');
  });

  it('renders the product fields and keeps the catalogue conditions in the back link', async () => {
    await openDetail('/shop/1?brandId=1&sort=priceAsc');

    pendingProduct(1).flush(boots);
    harness.fixture.detectChanges();
    const element = harness.routeNativeElement!;

    expect(element.querySelectorAll('h1').length).toBe(1);
    expect(element.querySelector('h1')!.textContent).toContain(boots.name);
    expect(element.textContent).toContain(boots.productBrand);
    expect(element.textContent).toContain(boots.productType);
    expect(element.textContent).toContain(boots.description);
    expect(element.textContent).toContain('NT$200');
    expect(element.querySelector<HTMLImageElement>('.detail-picture img')!.src).toContain(
      boots.pictureUrl,
    );
    expect(element.querySelector('.back-link')!.getAttribute('href')).toBe(
      '/shop?brandId=1&sort=priceAsc',
    );
    expect(document.title).toBe(`${boots.name} | SkiNet`);
  });

  it('returns to the plain catalogue when opened without conditions', async () => {
    await openDetail('/shop/1');
    pendingProduct(1).flush(boots);
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.querySelector('.back-link')!.getAttribute('href')).toBe(
      '/shop',
    );
  });

  it('loads the new product when the id changes', async () => {
    const component = await openDetail('/shop/1');
    pendingProduct(1).flush(boots);

    await router.navigateByUrl('/shop/2');
    harness.fixture.detectChanges();
    pendingProduct(2).flush({ ...boots, id: 2, name: 'Green Angular Board 3000' });
    harness.fixture.detectChanges();

    expect(component.product!.id).toBe(2);
    expect(harness.routeNativeElement!.textContent).toContain('Green Angular Board 3000');
  });

  it('does not request an invalid product id', async () => {
    localStorage.setItem('skinet.recently-viewed.v1', '{"version":1,"productIds":[2,17]}');
    harness = await RouterTestingHarness.create('/shop/0');
    for (const invalid of ['0', '-1', '1.5', 'abc']) {
      if (invalid !== '0') {
        await router.navigateByUrl(`/shop/${invalid}`);
      }
      harness.fixture.detectChanges();
      const element = harness.routeNativeElement!;

      expect(element.textContent).toContain('找不到商品');
      expect(element.querySelector('.back-link')!.getAttribute('href')).toBe('/shop');
      http.expectNone(
        candidate =>
          candidate.method === 'GET' && candidate.url.startsWith(`${environment.apiUrl}products/`),
      );
      expect(TestBed.inject(RecentViewsService).productIds()).toEqual([2, 17]);
    }
  });

  it('tells a missing product apart from a failed request and retries the current id', async () => {
    await openDetail('/shop/1');
    pendingProduct(1).flush('missing', { status: 404, statusText: 'Not Found' });
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('找不到商品');
    expect(harness.routeNativeElement!.textContent).not.toContain('商品載入失敗');
    expect(document.title).toBe('找不到商品 | SkiNet');

    await router.navigateByUrl('/shop/2');
    harness.fixture.detectChanges();
    pendingProduct(2).flush('boom', { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('商品載入失敗');
    expect(harness.routeNativeElement!.textContent).not.toContain('找不到商品');
    expect(document.title).toBe('商品載入失敗 | SkiNet');
    (harness.routeNativeElement!.querySelector('.product-retry') as HTMLButtonElement).click();
    pendingProduct(2).flush({ ...boots, id: 2, name: 'Retried product' });
    harness.fixture.detectChanges();

    expect(harness.routeNativeElement!.textContent).toContain('Retried product');
  });

  it('restores the filtered catalogue state after leaving the detail page', async () => {
    harness = await RouterTestingHarness.create('/shop?brandId=1');
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/brands`)
      .flush([{ id: 1, name: 'Angular' }]);
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/types`)
      .flush([{ id: 1, name: 'Boards' }]);
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products`)
      .flush({ pageIndex: 1, pageSize: 6, count: 1, data: [boots] });
    harness.fixture.detectChanges();

    const favorite = harness.routeNativeElement!.querySelector<HTMLButtonElement>('app-favorite-toggle button')!;
    favorite.click();
    harness.fixture.detectChanges();
    expect(TestBed.inject(FavoritesService).productIds()).toEqual([1]);
    const detailHref = harness
      .routeNativeElement!.querySelector('a.product-link')!
      .getAttribute('href')!;
    expect(detailHref).toBe('/shop/1?brandId=1');
    await harness.navigateByUrl(detailHref);
    await harness.fixture.whenStable();
    pendingProduct(1).flush(boots);
    harness.fixture.detectChanges();
    expect(router.url).toBe('/shop/1?brandId=1');
    const detailFavorite = harness.routeNativeElement!.querySelector<HTMLButtonElement>('app-favorite-toggle button')!;
    expect(detailFavorite.getAttribute('aria-pressed')).toBe('true');
    detailFavorite.click();
    harness.fixture.detectChanges();
    expect(TestBed.inject(FavoritesService).productIds()).toEqual([]);
    expect(TestBed.inject(CartService).totalQuantity()).toBe(0);

    const backHref = harness.routeNativeElement!.querySelector('.back-link')!.getAttribute('href')!;
    await harness.navigateByUrl(backHref);
    harness.fixture.detectChanges();
    const reloaded = harness.routeDebugElement!.componentInstance as ProductListComponent;
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/brands`)
      .flush([{ id: 1, name: 'Angular' }]);
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products/types`)
      .flush([{ id: 1, name: 'Boards' }]);
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}products`)
      .flush({ pageIndex: 1, pageSize: 6, count: 1, data: [boots] });
    harness.fixture.detectChanges();

    expect(router.url).toBe('/shop?brandId=1');
    expect(reloaded.query.brandId).toBe(1);
    const checked = harness.routeNativeElement!
      .querySelector<HTMLInputElement>('input[name=brand]:checked')!;
    expect(checked).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('app-favorite-toggle button')!.getAttribute('aria-pressed')).toBe('false');
  });

  // 僅已成功取得的商品能加入，且不自動離開詳情。
  it('adds one item per click and keeps the current route with an accessible confirmation', async () => {
    await openDetail('/shop/1');
    expect(harness.routeNativeElement!.querySelector('.add-to-cart')).toBeNull();
    pendingProduct(1).flush(boots);
    harness.fixture.detectChanges();
    const add = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.add-to-cart')!;
    add.click();
    add.click();
    harness.fixture.detectChanges();
    expect(TestBed.inject(CartService).items()).toEqual([{ productId: 1, quantity: 2 }]);
    expect(router.url).toBe('/shop/1');
    const status = harness.routeNativeElement!.querySelector('[aria-live="polite"]')!;
    expect(status.textContent).toContain('已加入購物車');
    expect(status.querySelector('a')!.getAttribute('href')).toBe('/cart');
    await router.navigateByUrl('/shop/2');
    pendingProduct(2).flush({ ...boots, id: 2 });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.textContent).not.toContain('已加入購物車');
  });

  // 不能把達上限或無法保存誤報為完整成功。
  it('reports the quantity limit and warns about persistence failures', async () => {
    await openDetail('/shop/1');
    pendingProduct(1).flush(boots);
    const cart = TestBed.inject(CartService);
    cart.add(1);
    cart.setQuantity(1, 99);
    harness.fixture.detectChanges();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.add-to-cart')!.click();
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('此商品最多可加入 99 件');
    expect(harness.routeNativeElement!.textContent).not.toContain('已加入購物車');
    expect(cart.totalQuantity()).toBe(99);
    cart.setQuantity(1, 1);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota'); });
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.add-to-cart')!.click();
    harness.fixture.detectChanges();
    expect(cart.totalQuantity()).toBe(2);
    expect(harness.routeNativeElement!.textContent).toContain('購物車暫時無法儲存，重新整理後可能遺失');
  });

  // 下架與暫時錯誤畫面皆不能加入未取得的商品。
  it('does not offer add controls for missing or failed products', async () => {
    await openDetail('/shop/1');
    expect(harness.routeNativeElement!.querySelector('app-favorite-toggle')).toBeNull();
    pendingProduct(1).flush('missing', { status: 404, statusText: 'Not Found' });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.add-to-cart')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('app-favorite-toggle')).toBeNull();
    await router.navigateByUrl('/shop/2');
    pendingProduct(2).flush('failed', { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.add-to-cart')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('app-favorite-toggle')).toBeNull();
    expect(TestBed.inject(CartService).totalQuantity()).toBe(0);
  });
});
