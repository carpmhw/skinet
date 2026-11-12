import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { Subscription } from 'rxjs';
import { IProduct } from '../models/product';
import { parseProductId, parseShopQuery, toShopParams } from './shop-query';
import { ShopService } from './shop.service';
import { CartService } from '../cart/cart.service';

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss'],
  standalone: false,
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly shop = inject(ShopService);
  private readonly title = inject(Title);

  product: IProduct | null = null;
  backParams: Params = {};
  loading = false;
  notFound = false;
  error = false;
  cartFeedback = '';
  addedToCart = false;

  private currentId: number | null = null;
  private idSub?: Subscription;
  private querySub?: Subscription;
  private requestSub?: Subscription;

  // 訂閱路由 id 與查詢條件，讓重新整理與直接連結都能還原畫面。
  ngOnInit(): void {
    this.querySub = this.route.queryParamMap.subscribe(params => {
      this.backParams = toShopParams(parseShopQuery(params));
    });
    this.idSub = this.route.paramMap.subscribe(params => {
      this.currentId = parseProductId(params.get('id'));
      this.loadProduct(this.currentId);
    });
  }

  // 釋放路由與商品請求訂閱。
  ngOnDestroy(): void {
    this.idSub?.unsubscribe();
    this.querySub?.unsubscribe();
    this.requestSub?.unsubscribe();
  }

  // 重試目前商品；id 已變更時不會誤讀前一個商品。
  retryProduct(): void {
    if (this.loading) {
      return;
    }
    this.loadProduct(this.currentId);
  }

  // 每次只加入目前已載入商品一件，依共用狀態回報結果而不跳頁。
  addToCart(): void {
    if (!this.product) return;
    this.addedToCart = this.cart.add(this.product.id);
    this.cartFeedback = this.addedToCart
      ? `已加入購物車，目前共 ${this.cart.totalQuantity()} 件。`
      : '此商品最多可加入 99 件';
  }

  // 依 id 載入商品，並區分不存在與其他載入錯誤。
  private loadProduct(id: number | null): void {
    this.cartFeedback = '';
    this.addedToCart = false;
    this.requestSub?.unsubscribe();
    this.product = null;
    this.notFound = false;
    this.error = false;

    if (id === null) {
      this.notFound = true;
      this.loading = false;
      this.title.setTitle('找不到商品 | SkiNet');
      return;
    }

    this.loading = true;
    this.title.setTitle('商品詳情 | SkiNet');
    this.requestSub = this.shop.getProduct(id).subscribe({
      next: product => {
        this.product = product;
        this.loading = false;
        this.title.setTitle(`${product.name} | SkiNet`);
      },
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        if (error.status === 404) {
          this.notFound = true;
          this.title.setTitle('找不到商品 | SkiNet');
        } else {
          this.error = true;
          this.title.setTitle('商品載入失敗 | SkiNet');
        }
      },
    });
  }
}
