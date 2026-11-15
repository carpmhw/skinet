import { TestBed } from '@angular/core/testing';
import { ComparisonService } from './comparison.service';

// 還原外部邊界，測試不清除任何應用程式儲存。
afterEach(() => vi.restoreAllMocks());

// 移除上限或錯用最新在前排序會破壞這個操作合約。
it('keeps unique selection order and rejects a fourth item', () => {
  const comparison = TestBed.inject(ComparisonService);
  expect(comparison.productIds()).toEqual([]);
  expect(comparison.count()).toBe(0);
  expect(comparison.feedback()).toBe('');
  comparison.toggle(17);
  comparison.toggle(2);
  comparison.toggle(3);
  expect(comparison.productIds()).toEqual([17, 2, 3]);
  comparison.toggle(4);
  expect(comparison.productIds()).toEqual([17, 2, 3]);
  expect(comparison.count()).toBe(3);
  expect(comparison.has(4)).toBe(false);
  expect(comparison.feedback()).toBe('最多比較3件商品，請先移除一件');
  comparison.toggle(2);
  expect(comparison.has(2)).toBe(false);
  comparison.toggle(2);
  expect(comparison.productIds()).toEqual([17, 3, 2]);
  expect(comparison.count()).toBe(3);
});

// 不存在的移除與空清除不能產生假的操作回饋。
it('updates feedback only for real actions', () => {
  const comparison = TestBed.inject(ComparisonService);
  comparison.toggle(17);
  expect(comparison.feedback()).toBe('已加入比較，目前共 1 件');
  comparison.remove(2);
  expect(comparison.feedback()).toBe('已加入比較，目前共 1 件');
  expect(comparison.productIds()).toEqual([17]);
  comparison.remove(17);
  expect(comparison.feedback()).toBe('已移除比較，目前共 0 件');
  expect(comparison.count()).toBe(0);
  comparison.clear();
  expect(comparison.feedback()).toBe('已移除比較，目前共 0 件');
  comparison.toggle(2);
  comparison.clear();
  expect(comparison.productIds()).toEqual([]);
  expect(comparison.count()).toBe(0);
  expect(comparison.feedback()).toBe('已清空比較清單');
});

// 公開操作必須拒絕無效ID，不能污染清單或回饋。
it.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'ignores invalid ID %s', id => {
    const comparison = TestBed.inject(ComparisonService);
    comparison.toggle(id);
    comparison.remove(id);
    expect(comparison.has(id)).toBe(false);
    expect(comparison.productIds()).toEqual([]);
    expect(comparison.count()).toBe(0);
    expect(comparison.feedback()).toBe('');
  }
);

// 任何偷偷加入的持久化讀寫都會在這裡失敗。
it('never accesses browser storage even when it is unavailable', () => {
  const local = { ...localStorage };
  const session = { ...sessionStorage };
  const spies = (['getItem', 'setItem', 'removeItem', 'clear'] as const).map(method =>
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    })
  );
  const comparison = TestBed.inject(ComparisonService);
  comparison.toggle(17);
  comparison.toggle(2);
  comparison.remove(17);
  expect(comparison.productIds()).toEqual([2]);
  comparison.clear();
  expect(comparison.productIds()).toEqual([]);
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  expect({ ...localStorage }).toEqual(local);
  expect({ ...sessionStorage }).toEqual(session);
});

// 跨元件取同root可保留，但新應用程式root必須從空清單開始。
it('shares selection within a root but starts empty with a fresh root', () => {
  const comparison = TestBed.inject(ComparisonService);
  comparison.toggle(17);
  expect(TestBed.inject(ComparisonService).productIds()).toEqual([17]);
  TestBed.resetTestingModule();
  const fresh = TestBed.inject(ComparisonService);
  expect(fresh.productIds()).toEqual([]);
  expect(fresh.count()).toBe(0);
  expect(fresh.feedback()).toBe('');
});
