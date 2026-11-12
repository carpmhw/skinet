import { computed, Injectable, signal } from '@angular/core';

export interface CartItem {
  readonly productId: number;
  readonly quantity: number;
}

const storageKey = 'skinet.cart.v1';
const unreadable = '儲存的購物車資料無法讀取，已使用空購物車';
const unsaved = '購物車暫時無法儲存，重新整理後可能遺失';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly state = signal<readonly CartItem[]>([]);
  private readonly warning = signal<string | null>(null);
  readonly items = this.state.asReadonly();
  readonly storageWarning = this.warning.asReadonly();
  // 總件數由目前有效項目推導，不另存一份計數。
  readonly totalQuantity = computed(() => this.state().reduce((sum, item) => sum + item.quantity, 0));

  // 僅在初始化讀取一次，於邊界驗證未知儲存內容。
  constructor() {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      this.warning.set(unsaved);
      return;
    }
    if (raw === null) return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.warning.set(unreadable);
      return;
    }
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1 ||
      !('items' in value) || !Array.isArray(value.items)) {
      this.warning.set(unreadable);
      return;
    }
    const items: CartItem[] = [];
    for (const row of value.items as unknown[]) {
      if (typeof row !== 'object' || row === null || !('productId' in row) || !('quantity' in row) ||
        typeof row.productId !== 'number' || !Number.isSafeInteger(row.productId) || row.productId <= 0 ||
        typeof row.quantity !== 'number' || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 99) continue;
      const index = items.findIndex(item => item.productId === row.productId);
      if (index === -1) items.push({ productId: row.productId, quantity: row.quantity });
      else items[index] = { productId: row.productId, quantity: Math.min(99, items[index].quantity + row.quantity) };
    }
    this.state.set(items);
  }

  // 詳情頁每次加入一件，拒絕非法 ID 與超過操作上限的加入。
  add(productId: number): boolean {
    if (!Number.isSafeInteger(productId) || productId <= 0) return false;
    const current = this.state().find(item => item.productId === productId);
    if (current?.quantity === 99) return false;
    this.save(current
      ? this.state().map(item => item.productId === productId ? { productId, quantity: item.quantity + 1 } : item)
      : [...this.state(), { productId, quantity: 1 }]);
    return true;
  }

  // 數量輸入只在此驗證，無效輸入不能改動或移除項目。
  setQuantity(productId: number, quantity: number): boolean {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99 ||
      !this.state().some(item => item.productId === productId)) return false;
    this.save(this.state().map(item => item.productId === productId ? { productId, quantity } : item));
    return true;
  }

  // 明確移除指定項目，不存在的項目不產生儲存副作用。
  remove(productId: number): void {
    if (!this.state().some(item => item.productId === productId)) return;
    this.save(this.state().filter(item => item.productId !== productId));
  }

  // 先更新本次操作狀態，僅攔截儲存失敗並提供可見警告。
  private save(items: readonly CartItem[]): void {
    this.state.set(items);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, items }));
      this.warning.set(null);
    } catch {
      this.warning.set(unsaved);
    }
  }
}
