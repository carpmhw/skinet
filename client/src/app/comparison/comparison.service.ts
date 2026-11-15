import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ComparisonService {
  private readonly state = signal<readonly number[]>([]);
  private readonly message = signal('');
  readonly productIds = this.state.asReadonly();
  readonly count = computed(() => this.state().length);
  readonly feedback = this.message.asReadonly();

  // 全站共用當次選取狀態，不建立另一份商品資料。
  has(productId: number): boolean {
    return this.state().includes(productId);
  }

  // 先允許取消，再檢查新增上限；拒絕第四件而不替換既有選取。
  toggle(productId: number): void {
    if (!Number.isSafeInteger(productId) || productId <= 0) return;
    if (this.has(productId)) {
      this.remove(productId);
      return;
    }
    if (this.count() === 3) {
      this.message.set('最多比較3件商品，請先移除一件');
      return;
    }
    this.state.update(ids => [...ids, productId]);
    this.message.set(`已加入比較，目前共 ${this.count()} 件`);
  }

  // 只有確實移除項目才更新回饋，保留其他項目的先後順序。
  remove(productId: number): void {
    if (!this.has(productId)) return;
    this.state.update(ids => ids.filter(id => id !== productId));
    this.message.set(`已移除比較，目前共 ${this.count()} 件`);
  }

  // 僅清空當次記憶體，不存取任何瀏覽器儲存。
  clear(): void {
    if (this.count() === 0) return;
    this.state.set([]);
    this.message.set('已清空比較清單');
  }
}
