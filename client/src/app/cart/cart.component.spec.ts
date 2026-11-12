import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterModule } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { IProduct } from '../models/product';
import { NotFoundComponent } from '../not-found.component';
import { ProductImageComponent } from '../shop/product-image.component';
import { TwdPricePipe } from '../shop/twd-price.pipe';
import { CartComponent } from './cart.component';
import { CartItem, CartService } from './cart.service';

// 經由路由、真實購物車與 HTTP 測試邊界驗證使用者操作。
describe('CartComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const key = 'skinet.cart.v1';
  const board: IProduct = {
    id: 1, name: 'Angular board', description: 'Demo board', price: 19.99,
    pictureUrl: '/images/products/sb-ang1.png', productType: 'Boards', productBrand: 'Angular',
  };

  // 每例獨立初始化路由與自己的儲存資料。
  beforeEach(() => {
    localStorage.removeItem(key);
    TestBed.configureTestingModule({
      declarations: [CartComponent, NotFoundComponent, ProductImageComponent, TwdPricePipe],
      imports: [RouterModule],
      providers: [provideZoneChangeDetection(), provideHttpClient(), provideHttpClientTesting(),
        provideRouter([{ path: 'cart', component: CartComponent }, { path: 'missing', component: NotFoundComponent }])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  // 確認所有請求都被處理並移除焦點測試的 DOM。
  afterEach(() => {
    http.verify();
    harness?.fixture.nativeElement.remove();
    localStorage.removeItem(key);
  });

  // 在建立 root service 前放入資料，模擬直接開啟與重新整理。
  async function open(items: readonly CartItem[] = []): Promise<void> {
    localStorage.setItem(key, JSON.stringify({ version: 1, items }));
    harness = await RouterTestingHarness.create('/cart');
    document.body.appendChild(harness.fixture.nativeElement);
    harness.fixture.detectChanges();
  }

  // 找出單一商品請求，不用假資料服務取代真正 HTTP 合約。
  function pending(id: number) {
    return http.expectOne(`${environment.apiUrl}products/${id}`);
  }

  // 取得目前列供使用者層級互動斷言使用。
  function row(id: number): HTMLElement {
    return harness.routeNativeElement!.querySelector<HTMLElement>(`[data-product-id="${id}"]`)!;
  }

  // 用真正 change 事件提交輸入。
  function change(id: number, value: string): HTMLInputElement {
    const input = row(id).querySelector<HTMLInputElement>('input')!;
    input.value = value;
    input.dispatchEvent(new Event('change'));
    harness.fixture.detectChanges();
    return input;
  }

  // 模擬點擊並完成下一次渲染與焦點轉移。
  async function remove(id: number): Promise<void> {
    row(id).querySelector<HTMLButtonElement>('.remove-item')!.click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
  }

  // 空車不能發出商品請求或展示假結帳。
  it('shows the empty cart and title without product requests or checkout', async () => {
    await open();
    expect(document.title).toBe('購物車 | SkiNet');
    expect(harness.routeNativeElement!.textContent).toContain('購物車目前是空的');
    expect(harness.routeNativeElement!.querySelector('a')!.getAttribute('href')).toBe('/shop');
    expect(harness.routeNativeElement!.querySelector('.cart-total')).toBeNull();
    http.expectNone(request => request.url.includes('products'));
  });

  // 使用當次 API 價格及整數分運算，改量不重查資料。
  it('renders fresh prices in stored order and calculates decimal totals without refetching on edits', async () => {
    await open([{ productId: 1, quantity: 3 }, { productId: 2, quantity: 3 }]);
    expect(harness.routeNativeElement!.querySelector('.cart-total')).toBeNull();
    pending(2).flush({ ...board, id: 2, name: 'Small item', price: 0.1 });
    pending(1).flush(board);
    harness.fixture.detectChanges();
    expect([...harness.routeNativeElement!.querySelectorAll('[data-product-id]')].map(element => element.getAttribute('data-product-id'))).toEqual(['1', '2']);
    expect(row(1).querySelector('a')!.getAttribute('href')).toBe('/shop/1');
    expect(row(1).textContent).toContain('NT$59.97');
    expect(row(2).textContent).toContain('NT$0.3');
    expect(harness.routeNativeElement!.querySelector('.cart-total')!.textContent).toContain('NT$60.27');
    change(1, '2');
    expect(harness.routeNativeElement!.querySelector('.cart-total')!.textContent).toContain('NT$40.28');
    http.expectNone(request => request.url.includes('products'));
    const cart = TestBed.inject(CartService);
    cart.add(3);
    harness.fixture.detectChanges();
    pending(3).flush({ ...board, id: 3, price: 10 });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.cart-total')!.textContent).toContain('NT$50.28');
    await remove(3);
    http.expectNone(request => request.url.includes('products'));
  });

  // 不合法輸入需恢復有效數量，不能誤當成移除。
  it('restores invalid inputs and clears the inline error after a valid change', async () => {
    await open([{ productId: 1, quantity: 2 }]);
    pending(1).flush(board);
    harness.fixture.detectChanges();
    for (const value of ['', '0', '-1', '1.5', '100', 'Infinity', 'NaN']) {
      expect(change(1, value).value).toBe('2');
      expect(row(1).textContent).toContain('請輸入 1–99 的整數');
      expect(TestBed.inject(CartService).items()).toEqual([{ productId: 1, quantity: 2 }]);
    }
    expect(change(1, '5').value).toBe('5');
    expect(row(1).querySelector('.quantity-error')).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!).items).toEqual([{ productId: 1, quantity: 5 }]);
  });

  // 不同種類的錯誤皆保留其他商品，不能將未知價格當零。
  it('keeps a missing product removable and hides the total until it is removed', async () => {
    await open([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 2 }]);
    pending(1).flush(board);
    pending(2).flush('missing', { status: 404, statusText: 'Not Found' });
    harness.fixture.detectChanges();
    expect(row(1).textContent).toContain('Angular board');
    expect(row(2).textContent).toContain('商品 #2 已無法購買');
    expect(row(2).querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    expect(row(2).querySelector('.retry-product')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.cart-total')).toBeNull();
    expect(harness.routeNativeElement!.textContent).toContain('暫無法計算總額');
    expect(TestBed.inject(CartService).totalQuantity()).toBe(3);
    await remove(2);
    expect(harness.routeNativeElement!.querySelector('.cart-total')!.textContent).toContain('NT$19.99');
    expect(document.activeElement).toBe(row(1).querySelector('.remove-item'));
  });

  // 重試只針對失敗列，成功後才補出完整總額。
  it('retries a failed row independently', async () => {
    await open([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }]);
    pending(1).flush(board);
    pending(2).flush('error', { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();
    expect(row(2).textContent).toContain('商品 #2 載入失敗');
    expect(harness.routeNativeElement!.querySelector('.cart-total')).toBeNull();
    const beforeRetry = document.activeElement;
    row(2).querySelector<HTMLButtonElement>('.retry-product')!.click();
    pending(2).flush({ ...board, id: 2, price: 5 });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.cart-total')!.textContent).toContain('NT$24.99');
    expect(document.activeElement).toBe(beforeRetry);
    http.expectNone(`${environment.apiUrl}products/1`);
  });

  // 重試不論成功或再度失敗，都不能讓鍵盤焦點掉回頁面根部。
  it.each([true, false])('preserves a keyboard focus target when retry success is %s', async success => {
    await open([{ productId: 1, quantity: 1 }]);
    pending(1).flush('failed', { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();
    const retry = row(1).querySelector<HTMLButtonElement>('.retry-product')!;
    retry.focus();
    retry.click();
    harness.fixture.detectChanges();
    const loadingFocus = document.activeElement;
    const request = pending(1);
    if (success) request.flush(board);
    else request.flush('failed', { status: 500, statusText: 'Server Error' });
    harness.fixture.detectChanges();
    expect(loadingFocus).toBe(row(1).querySelector('.remove-item'));
    expect(document.activeElement).toBe(row(1).querySelector('.remove-item'));
  });

  // 刪除載入中的列時取消請求，並將焦點交給下一列與空車標題。
  it('cancels removed rows and keeps focus usable through the last removal', async () => {
    await open([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }]);
    const first = pending(1);
    const second = pending(2);
    expect(row(1).querySelector<HTMLInputElement>('input')!.disabled).toBe(true);
    await remove(1);
    expect(first.cancelled).toBe(true);
    expect(row(1)).toBeNull();
    expect(document.activeElement).toBe(row(2).querySelector('.remove-item'));
    await remove(2);
    expect(second.cancelled).toBe(true);
    expect(document.activeElement).toBe(harness.routeNativeElement!.querySelector('#empty-cart-title'));
    expect(TestBed.inject(CartService).items()).toEqual([]);
  });

  // 每次重新進入都重新取得價格，離開則釋放請求。
  it('refetches current prices on reentry and cancels pending requests on navigation', async () => {
    await open([{ productId: 1, quantity: 1 }]);
    pending(1).flush(board);
    await harness.navigateByUrl('/missing');
    await harness.navigateByUrl('/cart');
    pending(1).flush({ ...board, price: 25 });
    harness.fixture.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.cart-total')!.textContent).toContain('NT$25');
    TestBed.inject(CartService).add(2);
    harness.fixture.detectChanges();
    const request = pending(2);
    await TestBed.inject(Router).navigateByUrl('/missing');
    expect(request.cancelled).toBe(true);
  });

  // 壞損或無法保存時，畫面必須可見警告而不是悄悄遺失。
  it('shows the storage warning when the stored root is corrupt', async () => {
    localStorage.setItem(key, '{');
    harness = await RouterTestingHarness.create('/cart');
    expect(harness.routeNativeElement!.textContent).toContain('儲存的購物車資料無法讀取，已使用空購物車');
  });
});
