import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, OnDestroy, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { IProduct } from '../models/product';
import { ShopService } from '../shop/shop.service';
import { RecentViewsService } from './recent-views.service';

interface ProductState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  product: IProduct | null;
}

@Component({
  selector: 'app-recently-viewed',
  templateUrl: './recently-viewed.component.html',
  styleUrls: ['./recently-viewed.component.scss'],
  standalone: false
})
export class RecentlyViewedComponent implements OnDestroy {
  readonly recentViews = inject(RecentViewsService);
  private readonly shop = inject(ShopService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly products = signal<Record<number, ProductState>>({});
  private readonly requests = new Map<number, Subscription>();
  private readonly feedback = signal('');
  readonly clearFeedback = this.feedback.asReadonly();
  readonly rows = computed(() => this.recentViews.productIds().map(productId => ({
    productId, ...(this.products()[productId] ?? { status: 'loading' as const, product: null })
  })));

  // 依本機順序取得當前商品資料，顯示查詢不記錄為新瀏覽。
  constructor() {
    inject(Title).setTitle('最近瀏覽 | SkiNet');
    effect(() => {
      const ids = this.recentViews.productIds();
      untracked(() => this.syncItems(ids));
    });
  }

  // 離頁時取消尚未完成的查詢，避免背景更新。
  ngOnDestroy(): void {
    for (const request of this.requests.values()) request.unsubscribe();
  }

  // 重試前把即將消失的控制焦點交給同列不被替換的標題。
  retryProduct(productId: number): void {
    if (this.products()[productId]?.status !== 'error') return;
    const row = this.element.nativeElement.querySelector<HTMLElement>(`[data-product-id="${productId}"]`);
    if (row?.querySelector('.retry-product') === this.element.nativeElement.ownerDocument.activeElement) {
      row?.querySelector<HTMLElement>('.recent-product-title')?.focus();
    }
    this.loadProduct(productId);
  }

  // 立即清除當次內容與查詢，僅在儲存移除成功時回報完整清除。
  clearHistory(): void {
    this.recentViews.clear();
    this.syncItems([]);
    this.feedback.set(this.recentViews.storageWarning() === null ? '已清除瀏覽紀錄' : '');
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLElement>('#empty-recently-viewed-title')?.focus();
    }, { injector: this.injector });
  }

  // 清除或移出上限的項目須取消，只為尚未取得的ID新增查詢。
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

  // 404保留紀錄但不提供無效重試，暫時失敗可由使用者逐項重試。
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
