import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, OnDestroy, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { IProduct } from '../models/product';
import { ShopService } from '../shop/shop.service';
import { FavoritesService } from './favorites.service';

interface ProductState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  product: IProduct | null;
}

@Component({
  selector: 'app-favorites',
  templateUrl: './favorites.component.html',
  styleUrls: ['./favorites.component.scss'],
  standalone: false
})
export class FavoritesComponent implements OnDestroy {
  readonly favorites = inject(FavoritesService);
  private readonly shop = inject(ShopService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly products = signal<Record<number, ProductState>>({});
  private readonly requests = new Map<number, Subscription>();
  readonly rows = computed(() => this.favorites.productIds().map(productId => ({
    productId, ...(this.products()[productId] ?? { status: 'loading' as const, product: null })
  })));

  // 以共享ID為唯一來源；每次進頁重新取得當前商品資料。
  constructor() {
    inject(Title).setTitle('收藏清單 | SkiNet');
    effect(() => {
      const ids = this.favorites.productIds();
      untracked(() => this.syncItems(ids));
    });
  }

  // 離頁取消尚未完成的商品查詢。
  ngOnDestroy(): void {
    for (const request of this.requests.values()) request.unsubscribe();
  }

  // 重試時將即將消失的按鈕焦點交給同列穩定控制。
  retryProduct(productId: number): void {
    if (this.products()[productId]?.status !== 'error') return;
    const row = this.element.nativeElement.querySelector<HTMLElement>(`[data-product-id="${productId}"]`);
    if (row?.querySelector('.retry-product') === this.element.nativeElement.ownerDocument.activeElement) {
      row?.querySelector<HTMLButtonElement>('.remove-favorite')?.focus();
    }
    this.loadProduct(productId);
  }

  // 移除後聚焦下一列、上一列或空清單標題。
  removeItem(productId: number): void {
    const ids = this.favorites.productIds();
    const index = ids.indexOf(productId);
    if (index === -1) return;
    const nextId = ids[index + 1] ?? ids[index - 1];
    this.favorites.remove(productId);
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLElement>(nextId === undefined
        ? '#empty-favorites-title' : `[data-product-id="${nextId}"] .remove-favorite`)?.focus();
    }, { injector: this.injector });
  }

  // 取消已移除項目的查詢，只為新增項目載入資料。
  private syncItems(ids: readonly number[]): void {
    const retained = new Set(ids);
    for (const [id, request] of this.requests) {
      if (!retained.has(id)) {
        request.unsubscribe();
        this.requests.delete(id);
      }
    }
    this.products.update(products => Object.fromEntries(
      Object.entries(products).filter(([id]) => retained.has(Number(id)))
    ));
    for (const id of ids) {
      if (!this.products()[id]) this.loadProduct(id);
    }
  }

  // 將不存在與暫時錯誤分開，不自動刪除收藏ID。
  private loadProduct(productId: number): void {
    this.requests.get(productId)?.unsubscribe();
    this.products.update(products => ({ ...products, [productId]: { status: 'loading', product: null } }));
    this.requests.set(productId, this.shop.getProduct(productId).subscribe({
      next: product => this.products.update(products => ({ ...products, [productId]: { status: 'ready', product } })),
      error: (error: HttpErrorResponse) => this.products.update(products => ({
        ...products, [productId]: { status: error.status === 404 ? 'unavailable' : 'error', product: null }
      }))
    }));
  }
}
