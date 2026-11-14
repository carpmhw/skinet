import { computed, Injectable, signal } from '@angular/core';

const storageKey = 'skinet.favorites.v1';
const unreadable = '儲存的收藏資料無法讀取，已使用空清單';
const unsaved = '收藏暫時無法儲存，重新整理後可能遺失';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly state = signal<readonly number[]>([]);
  private readonly warning = signal<string | null>(null);
  private readonly message = signal('');
  readonly productIds = this.state.asReadonly();
  readonly storageWarning = this.warning.asReadonly();
  readonly feedback = this.message.asReadonly();
  readonly count = computed(() => this.state().length);

  // 於儲存邊界一次解析及驗證，只接受版本化且唯一的合法商品ID。
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
      !('productIds' in value) || !Array.isArray(value.productIds)) {
      this.warning.set(unreadable);
      return;
    }
    this.state.set([...new Set((value.productIds as unknown[]).filter(
      (id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    ))]);
  }

  // 查詢共用狀態，列表、詳情與導覽不另外保存副本。
  has(productId: number): boolean {
    return this.state().includes(productId);
  }

  // 公開操作邊界驗證ID，新收藏排最前，已收藏則取消。
  toggle(productId: number): void {
    if (!Number.isSafeInteger(productId) || productId <= 0) return;
    if (this.has(productId)) this.remove(productId);
    else this.save([productId, ...this.state()], '已加入收藏');
  }

  // 不存在的項目不寫入儲存或變更回饋。
  remove(productId: number): void {
    if (!this.has(productId)) return;
    this.save(this.state().filter(id => id !== productId), '已取消收藏');
  }

  // 先保存本次記憶體操作，儲存失敗時保留內容並顯示警告。
  private save(ids: readonly number[], action: string): void {
    this.state.set(ids);
    this.message.set(`${action}，目前共 ${ids.length} 項`);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, productIds: ids }));
      this.warning.set(null);
    } catch {
      this.warning.set(unsaved);
    }
  }
}
