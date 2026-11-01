import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ShopService } from './shop.service';
import { ShopQuery } from './shop-query';

describe('ShopService', () => {
  let service: ShopService;
  let http: HttpTestingController;

  const defaultQuery: ShopQuery = {
    search: '',
    brandId: null,
    typeId: null,
    sort: 'name',
    pageIndex: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShopService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShopService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // 驗證列表請求固定每頁六件並帶上目前查詢條件。
  it('requests the catalogue with a page size of six and the query conditions', () => {
    service
      .getProducts({ search: 'Core', brandId: 2, typeId: 3, sort: 'priceDesc', pageIndex: 4 })
      .subscribe();

    const request = http.expectOne(
      candidate => candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products`,
    );
    expect(request.request.params.get('pageIndex')).toBe('4');
    expect(request.request.params.get('pageSize')).toBe('6');
    expect(request.request.params.get('search')).toBe('Core');
    expect(request.request.params.get('brandId')).toBe('2');
    expect(request.request.params.get('typeId')).toBe('3');
    expect(request.request.params.get('sort')).toBe('priceDesc');
    request.flush({});
  });

  it('omits the default sort and empty filters from the request', () => {
    service.getProducts(defaultQuery).subscribe();

    const request = http.expectOne(
      candidate => candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products`,
    );
    expect(request.request.params.get('pageIndex')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('6');
    expect(request.request.params.has('sort')).toBe(false);
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('brandId')).toBe(false);
    expect(request.request.params.has('typeId')).toBe(false);
    request.flush({});
  });

  it('requests a single product by id', () => {
    service.getProduct(7).subscribe();

    const request = http.expectOne(
      candidate => candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products/7`,
    );
    expect(request.request.responseType).toBe('json');
    request.flush({ id: 7 });
  });

  it('requests brands and types from their own endpoints', () => {
    service.getBrands().subscribe();
    service.getTypes().subscribe();

    http
      .expectOne(
        candidate =>
          candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products/brands`,
      )
      .flush([]);
    http
      .expectOne(
        candidate =>
          candidate.method === 'GET' && candidate.url === `${environment.apiUrl}products/types`,
      )
      .flush([]);
  });
});
