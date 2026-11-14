import { Injectable, signal } from '@angular/core';

const storageKey = 'skinet.recently-viewed.v1';
const unreadable = '儲存的瀏覽紀錄無法讀取，已使用空清單';
const unsaved = '瀏覽紀錄暫時無法儲存，重新整理後可能遺失';
const uncleared = '已清除本次紀錄，但無法清除瀏覽器儲存資料，重新整理後可能再次出現';

@Injectable({ providedIn: 'root' })
export class RecentViewsService {
  private readonly state = signal<readonly number[]>([]);
  private readonly warning = signal<string | null>(null);
  readonly productIds = this.state.asReadonly();
  readonly storageWarning = this.warning.asReadonly();

  // 僅在儲存邊界解析未知資料，保留最近十二件唯一合法商品ID。
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
    ))].slice(0, 12));
  }

  // 成功瀏覽才呼叫；首位未變不重複寫入，失敗仍保留當次記憶體內容。
  record(productId: number): void {
    if (!Number.isSafeInteger(productId) || productId <= 0 || this.state()[0] === productId) return;
    const ids = [productId, ...this.state().filter(id => id !== productId)].slice(0, 12);
    this.state.set(ids);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, productIds: ids }));
      this.warning.set(null);
    } catch {
      this.warning.set(unsaved);
    }
  }

  // 即使當次清單已空仍嘗試清除舊資料，失敗時不宣稱已完整刪除。
  clear(): void {
    this.state.set([]);
    try {
      window.localStorage.removeItem(storageKey);
      this.warning.set(null);
    } catch {
      this.warning.set(uncleared);
    }
  }
}
