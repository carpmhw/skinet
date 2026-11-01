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
    TestBed.configureTestingModule({
      declarations: [
        ProductDetailComponent,
        ProductListComponent,
        NotFoundComponent,
        ProductImageComponent,
        TwdPricePipe,
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

  afterEach(() => http.verify());

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

    const detailHref = harness
      .routeNativeElement!.querySelector('a.product-card')!
      .getAttribute('href')!;
    expect(detailHref).toBe('/shop/1?brandId=1');
    await harness.navigateByUrl(detailHref);
    await harness.fixture.whenStable();
    pendingProduct(1).flush(boots);
    harness.fixture.detectChanges();
    expect(router.url).toBe('/shop/1?brandId=1');

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
  });
});
