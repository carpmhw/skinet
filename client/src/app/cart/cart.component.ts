import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, effect, ElementRef, inject, Injector, OnDestroy, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { IProduct } from '../models/product';
import { ShopService } from '../shop/shop.service';
import { CartItem, CartService } from './cart.service';

interface ProductState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  product: IProduct | null;
}

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss'],
  standalone: false,
})
export class CartComponent implements OnDestroy {
  readonly cart = inject(CartService);
  private readonly shop = inject(ShopService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly products = signal<Record<number, ProductState>>({});
  private readonly requests = new Map<number, Subscription>();
  readonly quantityErrors = signal<Record<number, boolean>>({});

  // 顯示順序與數量取自共用狀態，商品只保留於此頁生命週期。
  readonly rows = computed(() => this.cart.items().map(item => {
    const state = this.products()[item.productId] ?? { status: 'loading' as const, product: null };
    return { ...item, ...state, subtotalCents: state.product ? Math.round(state.product.price * 100) * item.quantity : null };
  }));

  // 資料不完整時不把未知價格當成零元。
  readonly total = computed(() => {
    const rows = this.rows();
    return rows.length && rows.every(row => row.status === 'ready')
      ? rows.reduce((sum, row) => sum + row.subtotalCents!, 0) / 100 : null;
  });

  // 只追蹤項目清單；商品回應不觸發新一輪同步或重查。
  constructor() {
    inject(Title).setTitle('購物車 | SkiNet');
    effect(() => {
      const items = this.cart.items();
      untracked(() => this.syncItems(items));
    });
  }

  // 離開頁面取消尚未完成的請求，避免晚回應重建畫面。
  ngOnDestroy(): void {
    for (const request of this.requests.values()) request.unsubscribe();
  }

  // 僅重試失敗的指定列，不重新載入其他商品。
  retryProduct(productId: number): void {
    if (this.products()[productId]?.status !== 'error') return;
    const row = this.element.nativeElement.querySelector<HTMLElement>(`[data-product-id="${productId}"]`);
    // 鍵盤啟動的重試按鈕將被移除，先把焦點移至同列穩定的按鈕。
    if (row?.querySelector('.retry-product') === this.element.nativeElement.ownerDocument.activeElement) {
      row?.querySelector<HTMLButtonElement>('.remove-item')?.focus();
    }
    this.loadProduct(productId);
  }

  // 數量規則由 service 驗證，拒絕時還原 DOM 中的原有效值。
  changeQuantity(productId: number, input: HTMLInputElement): void {
    if (this.products()[productId]?.status !== 'ready') return;
    const accepted = this.cart.setQuantity(productId, input.valueAsNumber);
    this.quantityErrors.update(errors => ({ ...errors, [productId]: !accepted }));
    if (!accepted) input.value = String(this.cart.items().find(item => item.productId === productId)!.quantity);
  }

  // 移除後於新畫面完成時將焦點交給相鄰列，空車則聚焦標題。
  removeItem(productId: number): void {
    const items = this.cart.items();
    const index = items.findIndex(item => item.productId === productId);
    if (index === -1) return;
    const nextId = items[index + 1]?.productId ?? items[index - 1]?.productId;
    this.cart.remove(productId);
    afterNextRender(() => {
      this.element.nativeElement.querySelector<HTMLElement>(nextId === undefined
        ? '#empty-cart-title' : `[data-product-id="${nextId}"] .remove-item`)?.focus();
    }, { injector: this.injector });
  }

  // 移除已不存在的資料與請求，只對新增 ID 查詢，改量不重查。
  private syncItems(items: readonly CartItem[]): void {
    const ids = new Set(items.map(item => item.productId));
    for (const [id, request] of this.requests) {
      if (!ids.has(id)) {
        request.unsubscribe();
        this.requests.delete(id);
      }
    }
    this.products.update(products => Object.fromEntries(Object.entries(products).filter(([id]) => ids.has(Number(id)))));
    this.quantityErrors.update(errors => Object.fromEntries(Object.entries(errors).filter(([id]) => ids.has(Number(id)))));
    for (const item of items) {
      if (!this.products()[item.productId]) this.loadProduct(item.productId);
    }
  }

  // 分別記錄下架與暫時錯誤，每筆請求獨立處理。
  private loadProduct(productId: number): void {
    this.requests.get(productId)?.unsubscribe();
    this.products.update(products => ({ ...products, [productId]: { status: 'loading', product: null } }));
    this.requests.set(productId, this.shop.getProduct(productId).subscribe({
      next: product => this.products.update(products => ({ ...products, [productId]: { status: 'ready', product } })),
      error: (error: HttpErrorResponse) => this.products.update(products => ({
        ...products, [productId]: { status: error.status === 404 ? 'unavailable' : 'error', product: null },
      })),
    }));
  }
}
