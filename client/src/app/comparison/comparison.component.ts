import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, OnDestroy, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { IProduct } from '../models/product';
import { ShopService } from '../shop/shop.service';
import { ComparisonService } from './comparison.service';

interface ProductState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  product: IProduct | null;
}

@Component({
  selector: 'app-comparison',
  templateUrl: './comparison.component.html',
  styleUrls: ['./comparison.component.scss'],
  standalone: false
})
export class ComparisonComponent implements OnDestroy {
  readonly comparison = inject(ComparisonService);
  private readonly shop = inject(ShopService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly products = signal<Record<number, ProductState>>({});
  private readonly requests = new Map<number, Subscription>();
  readonly columns = computed(() => this.comparison.productIds().map(productId => ({
    productId, ...(this.products()[productId] ?? { status: 'loading' as const, product: null })
  })));

  // 以選取順序取得最新商品，不將顯示查詢視為詳情瀏覽。
  constructor() {
    inject(Title).setTitle('商品比較 | SkiNet');
    effect(() => {
      const ids = this.comparison.productIds();
      untracked(() => this.syncItems(ids));
    });
  }

  // 離頁取消請求，商品資料不作跨頁快取。
  ngOnDestroy(): void {
    for (const request of this.requests.values()) request.unsubscribe();
  }

  // 即將消失的重試控制先交出焦點給同欄穩定標題。
  retryProduct(productId: number): void {
    if (this.products()[productId]?.status !== 'error') return;
    const header = this.element.nativeElement.querySelector<HTMLElement>(`thead th[data-product-id="${productId}"]`);
    if (header?.querySelector('.retry-product') === this.element.nativeElement.ownerDocument.activeElement) {
      header?.querySelector<HTMLElement>('.comparison-product-title')?.focus();
    }
    this.loadProduct(productId);
  }

  // 移除後優先聚焦下一欄，沒有下一欄則上一欄或空標題。
  removeItem(productId: number): void {
    const ids = this.comparison.productIds();
    const index = ids.indexOf(productId);
    if (index === -1) return;
    const nextId = ids[index + 1] ?? ids[index - 1];
    this.comparison.remove(productId);
    this.syncItems(this.comparison.productIds());
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLElement>(nextId === undefined
        ? '#empty-comparison-title' : `thead th[data-product-id="${nextId}"] .remove-comparison`)?.focus();
    }, { injector: this.injector });
  }

  // 清空當次比較並立即取消所有查詢，不觸碰其他選品資料。
  clearComparison(): void {
    this.comparison.clear();
    this.syncItems([]);
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLElement>('#empty-comparison-title')?.focus();
    }, { injector: this.injector });
  }

  // 取消移出清單的欄位，只查詢新增ID，保留其他商品資料。
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

  // 404與暫時錯誤分開呈現，失敗不移除選取或沿用舊價格。
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
