import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IPagination } from '../models/pagination';
import { IProduct } from '../models/product';
import { ProductLookup, ShopQuery } from './shop-query';

@Injectable({ providedIn: 'root' })
export class ShopService {
  private readonly http = inject(HttpClient);
  private readonly productsUrl = `${environment.apiUrl}products`;

  // 依查詢條件取得固定每頁六件的商品頁。
  getProducts(query: ShopQuery): Observable<IPagination> {
    let params = new HttpParams()
      .set('pageIndex', query.pageIndex)
      .set('pageSize', 6);
    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.brandId !== null) {
      params = params.set('brandId', query.brandId);
    }
    if (query.typeId !== null) {
      params = params.set('typeId', query.typeId);
    }
    if (query.sort !== 'name') {
      params = params.set('sort', query.sort);
    }
    return this.http.get<IPagination>(this.productsUrl, { params });
  }

  // 取得單一商品，由呼叫端區分不存在與其他載入錯誤。
  getProduct(id: number): Observable<IProduct> {
    return this.http.get<IProduct>(`${this.productsUrl}/${id}`);
  }

  // 取得篩選用的品牌清單。
  getBrands(): Observable<ProductLookup[]> {
    return this.http.get<ProductLookup[]>(`${this.productsUrl}/brands`);
  }

  // 取得篩選用的商品類型清單。
  getTypes(): Observable<ProductLookup[]> {
    return this.http.get<ProductLookup[]>(`${this.productsUrl}/types`);
  }
}
