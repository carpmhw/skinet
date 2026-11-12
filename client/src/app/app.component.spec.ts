import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppComponent } from './app.component';
import { AppModule } from './app.module';
import { CartService } from './cart/cart.service';
import { environment } from '../environments/environment';

describe('AppComponent', () => {
  beforeEach(async () => {
    localStorage.removeItem('skinet.cart.v1');
    await TestBed.configureTestingModule({
      imports: [AppModule],
      // Match the zone-based change detection configured in main.ts.
      providers: [
        provideZoneChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  // 避免全站購物車測試跨案例殘留資料。
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.removeItem('skinet.cart.v1');
  });

  it('renders the SkiNet shell with a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.wordmark')?.textContent).toContain('SkiNet');
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
    expect(compiled.querySelector('main#main-content')).not.toBeNull();
    expect(compiled.querySelector('footer')?.textContent).toContain('價格以新臺幣 TWD 顯示');
  });

  // 真實購物車入口應隨共用狀態更新，會員入口仍不提供。
  it('shows a real cart count without placeholder account controls', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.textContent).not.toContain('Login');
    expect(compiled.textContent).not.toContain('Sign up');
    const link = compiled.querySelector('nav a[href="/cart"]')!;
    expect(link.textContent).toContain('購物車（0）');
    const cart = TestBed.inject(CartService);
    cart.add(1);
    cart.add(1);
    cart.add(2);
    fixture.detectChanges();
    expect(link.textContent).toContain('購物車（3）');
    cart.remove(1);
    fixture.detectChanges();
    expect(link.textContent).toContain('購物車（1）');
  });

  it('moves focus to the main content when the route path changes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/missing');
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('#main-content'),
    );
  });

  // 詳情與導覽、購物車路由必須共用同一個 root service。
  it('shares the cart across detail, navigation and the cart route with fresh pricing', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await router.navigateByUrl('/shop/1');
    fixture.detectChanges();
    const product = { id: 1, name: 'Demo board', description: 'Demo', price: 200,
      pictureUrl: '/images/products/sb-ang1.png', productType: 'Boards', productBrand: 'Angular' };
    http.expectOne(`${environment.apiUrl}products/1`).flush(product);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    element.querySelector<HTMLButtonElement>('.add-to-cart')!.click();
    fixture.detectChanges();
    expect(element.querySelector('nav a[href="/cart"]')!.textContent).toContain('購物車（1）');
    await router.navigateByUrl('/cart');
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}products/1`).flush({ ...product, price: 250 });
    fixture.detectChanges();
    expect(element.querySelector('.cart-total')!.textContent).toContain('NT$250');
    expect(element.querySelector('[data-product-id="1"]')!.textContent).toContain('Demo board');
  });
});
