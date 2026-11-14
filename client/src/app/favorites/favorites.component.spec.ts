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
import { ProductImageComponent } from '../shop/product-image.component';
import { TwdPricePipe } from '../shop/twd-price.pipe';
import { FavoritesComponent } from './favorites.component';
import { FavoritesService } from './favorites.service';

describe('FavoritesComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const key = 'skinet.favorites.v1';
  const board: IProduct = {
    id: 17, name: 'Angular board', description: 'Demo board', price: 19.99,
    pictureUrl: '/images/products/sb-ang1.png', productType: 'Boards', productBrand: 'Angular'
  };

  // 使用正式路由與真實商品服務，只替換HTTP傳輸邊界。
  beforeEach(() => {
    localStorage.removeItem(key);
    TestBed.configureTestingModule({
      declarations: [FavoritesComponent, NotFoundComponent, ProductImageComponent, TwdPricePipe],
      imports: [AppRoutingModule, RouterModule],
      providers: [provideZoneChangeDetection(), provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  // 取消測試頁面並驗證沒有未處理請求，清理僅限收藏key。
  afterEach(() => {
    harness?.fixture.destroy();
    harness?.fixture.nativeElement.remove();
    http.verify();
    localStorage.removeItem(key);
  });

  // 在root service初始化前放入ID，模擬重新整理收藏頁。
  async function open(ids: readonly number[] = []): Promise<void> {
    localStorage.setItem(key, JSON.stringify({ version: 1, productIds: ids }));
    harness = await RouterTestingHarness.create('/favorites');
    document.body.appendChild(harness.fixture.nativeElement);
    harness.fixture.detectChanges();
  }

  // 對真實商品查詢合約回應，避免假服務掩蓋端點錯誤。
  function pending(id: number) {
    return http.expectOne(`${environment.apiUrl}products/${id}`);
  }

  // 取得單列可互動DOM供焦點與狀態斷言。
  function row(id: number): HTMLElement {
    return harness.routeNativeElement!.querySelector<HTMLElement>(`[data-product-id="${id}"]`)!;
  }

  // 執行使用者移除操作並等待畫面完成焦點轉移。
  async function remove(id: number): Promise<void> {
    const button = row(id).querySelector<HTMLButtonElement>('.remove-favorite')!;
    button.focus();
    button.click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }

  it('opens the real favorites route with an empty state and no product requests', async () => {
    await open();
    expect(TestBed.inject(Router).url).toBe('/favorites');
    expect(document.title).toBe('收藏清單 | SkiNet');
    expect(harness.routeNativeElement!.textContent).toContain('收藏清單目前是空的');
    expect(harness.routeNativeElement!.querySelector('a')!.getAttribute('href')).toBe('/shop');
    expect(harness.routeNativeElement!.textContent).not.toContain('加入購物車');
    http.expectNone(request => request.url.includes('products'));
  });

  it('renders fresh API prices in stored order even when responses arrive out of order', async () => {
    await open([17, 2]);
    expect(row(17).textContent).toContain('正在載入');
    pending(2).flush({ ...board, id: 2, name: 'Second board', price: 100 });
    pending(17).flush(board);
    harness.fixture.detectChanges();
    expect([...harness.routeNativeElement!.querySelectorAll('[data-product-id]')].map(
      element => element.getAttribute('data-product-id')
    )).toEqual(['17', '2']);
    expect(row(17).textContent).toContain('NT$19.99');
    expect(row(2).textContent).toContain('NT$100');
    expect(row(17).querySelector('a')!.getAttribute('href')).toBe('/shop/17');
    expect(row(17).querySelector('app-product-image')).not.toBeNull();
    expect(row(17).querySelector('button')!.closest('a')).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, productIds: [17, 2] });
  });

  it('retains missing and failed products, and retries only the failed row', async () => {
    await open([17, 2]);
    pending(17).flush({}, { status: 404, statusText: 'Not found' });
    pending(2).flush({}, { status: 500, statusText: 'Unavailable' });
    harness.fixture.detectChanges();
    expect(row(17).textContent).toContain('已無法取得');
    expect(row(2).textContent).toContain('載入失敗');
    expect(TestBed.inject(FavoritesService).productIds()).toEqual([17, 2]);
    const retry = row(2).querySelector<HTMLButtonElement>('.retry-product')!;
    retry.focus();
    retry.click();
    harness.fixture.detectChanges();
    expect(document.activeElement).toBe(row(2).querySelector('.remove-favorite'));
    const request = pending(2);
    (harness.routeDebugElement!.componentInstance as FavoritesComponent).retryProduct(2);
    http.expectNone(`${environment.apiUrl}products/2`);
    http.expectNone(`${environment.apiUrl}products/17`);
    request.flush({ ...board, id: 2 });
    harness.fixture.detectChanges();
    expect(row(2).textContent).toContain('Angular board');
    expect(row(17).textContent).toContain('已無法取得');
  });

  it('moves focus to the next row, previous row, then the empty state on removal', async () => {
    await open([17, 2, 3]);
    for (const id of [17, 2, 3]) pending(id).flush({ ...board, id });
    harness.fixture.detectChanges();
    await remove(2);
    expect(document.activeElement).toBe(row(3).querySelector('.remove-favorite'));
    await remove(3);
    expect(document.activeElement).toBe(row(17).querySelector('.remove-favorite'));
    await remove(17);
    expect(document.activeElement?.id).toBe('empty-favorites-title');
    expect(TestBed.inject(FavoritesService).count()).toBe(0);
    http.expectNone(request => request.url.includes('products'));
  });

  it('cancels removed loading rows without resurrecting them or refetching retained rows', async () => {
    await open([17, 2]);
    const removed = pending(17);
    const retained = pending(2);
    await remove(17);
    expect(removed.cancelled).toBe(true);
    retained.flush({ ...board, id: 2 });
    harness.fixture.detectChanges();
    expect(row(17)).toBeNull();
    expect(row(2).textContent).toContain('Angular board');
    expect(TestBed.inject(FavoritesService).productIds()).toEqual([2]);
    http.expectNone(request => request.url.includes('products'));
  });

  it('cancels pending requests when navigating away', async () => {
    await open([17]);
    const request = pending(17);
    await harness.navigateByUrl('/missing');
    expect(request.cancelled).toBe(true);
  });

  it('fetches current product data again on a fresh visit', async () => {
    await open([17]);
    pending(17).flush(board);
    await harness.navigateByUrl('/missing');
    await harness.navigateByUrl('/favorites');
    pending(17).flush({ ...board, price: 25 });
    harness.fixture.detectChanges();
    expect(row(17).textContent).toContain('NT$25');
  });
});
