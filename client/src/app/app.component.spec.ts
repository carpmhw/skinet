import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { environment } from '../environments/environment';
import { AppComponent } from './app.component';
import { IProduct } from './models/product';
import { NavBarComponent } from './nav-bar/nav-bar.component';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent, NavBarComponent],
      // Match the zone-based change detection configured in main.ts.
      providers: [provideZoneChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function renderProducts(products: IProduct[] = []) {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const request = http.expectOne({
      method: 'GET',
      url: `${environment.apiUrl}products?pageSize=50`,
    });
    request.flush({ pageIndex: 1, pageSize: 50, count: products.length, data: products });
    fixture.detectChanges();
    return fixture;
  }

  it('should create the app', () => {
    const fixture = renderProducts();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.container li').length).toBe(0);
  });

  it('should render the Skinet heading and navigation', () => {
    const fixture = renderProducts();
    const compiled: HTMLElement = fixture.nativeElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Welcome to Skinet!');
    expect(compiled.querySelector('app-nav-bar nav')?.textContent).toContain('Shop');
  });

  it('should render products returned by the API', () => {
    const product: IProduct = {
      id: 1,
      name: 'Angular Boots',
      description: 'Snow boots',
      price: 120,
      pictureUrl: '/assets/images/boots.png',
      productType: 'Boots',
      productBrand: 'Angular',
    };
    const fixture = renderProducts([
      product,
      { ...product, id: 2, name: 'Core Gloves' },
    ]);
    const compiled: HTMLElement = fixture.nativeElement;
    const names = Array.from(compiled.querySelectorAll('.container li'))
      .map(item => item.textContent?.trim());
    expect(names).toEqual(['Angular Boots', 'Core Gloves']);
  });
});
