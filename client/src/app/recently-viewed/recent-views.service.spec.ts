import { TestBed } from '@angular/core/testing';
import { RecentViewsService } from './recent-views.service';

const key = 'skinet.recently-viewed.v1';
const unsaved = '瀏覽紀錄暫時無法儲存，重新整理後可能遺失';
const unreadable = '儲存的瀏覽紀錄無法讀取，已使用空清單';
const uncleared = '已清除本次紀錄，但無法清除瀏覽器儲存資料，重新整理後可能再次出現';

// 每例僅隔離自己的瀏覽紀錄，不清除整個瀏覽器儲存。
beforeEach(() => localStorage.removeItem(key));
// 還原外部儲存邊界後清理本例資料。
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(key);
});

// 建立新的root service模擬重新整理。
function fresh(): RecentViewsService {
  TestBed.resetTestingModule();
  return TestBed.inject(RecentViewsService);
}

// 缺少去重或首位短路會讓順序或寫入次數失敗。
it('records unique IDs newest first without rewriting the first item', () => {
  const recent = fresh();
  expect(recent.productIds()).toEqual([]);
  expect(recent.storageWarning()).toBeNull();
  recent.record(17);
  recent.record(2);
  recent.record(17);
  expect(recent.productIds()).toEqual([17, 2]);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  recent.record(17);
  expect(write).not.toHaveBeenCalled();
});

// 缺少截斷或重排會保留最舊商品或重複項目。
it('limits history to twelve and moves existing items to the front', () => {
  const recent = fresh();
  for (let id = 1; id <= 13; id++) recent.record(id);
  expect(recent.productIds()).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  recent.record(7);
  expect(recent.productIds()).toEqual([7, 13, 12, 11, 10, 9, 8, 6, 5, 4, 3, 2]);
});

// 讀取邊界必須清理非法項目但保留有效順序。
it('normalizes stored IDs and truncates stored history', () => {
  localStorage.setItem(key, JSON.stringify({
    version: 1, productIds: [17, 2, 17, 0, '3', null, 1.2, -1, Number.MAX_SAFE_INTEGER + 1]
  }));
  expect(fresh().productIds()).toEqual([17, 2]);
  localStorage.setItem(key, JSON.stringify({
    version: 1, productIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  }));
  expect(fresh().productIds()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

// 公開操作不可將無效ID寫入。
it.each([0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid operation ID %s', id => {
    const recent = fresh();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    recent.record(id);
    expect(recent.productIds()).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  }
);

// 損壞或不支援格式必須明示，而不是當作有效紀錄。
it.each(['{', 'null', '{"version":2,"productIds":[17]}', '{"version":1,"productIds":{}}'])(
  'warns about unreadable storage: %s', raw => {
    localStorage.setItem(key, raw);
    const recent = fresh();
    expect(recent.productIds()).toEqual([]);
    expect(recent.storageWarning()).toBe(unreadable);
  }
);

// 權限錯誤不阻擋當次操作，成功寫入可恢復。
it('keeps working after storage read failure', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  const recent = fresh();
  expect(recent.storageWarning()).toBe(unsaved);
  read.mockRestore();
  recent.record(17);
  expect(recent.productIds()).toEqual([17]);
  expect(recent.storageWarning()).toBeNull();
});

// 寫入失敗不能丟掉記憶體資料或首位短路後誤清警告。
it('retains memory on write failure until a changed history is saved', () => {
  const recent = fresh();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  recent.record(17);
  recent.record(2);
  expect(recent.productIds()).toEqual([2, 17]);
  expect(recent.storageWarning()).toBe(unsaved);
  write.mockRestore();
  const recoveredWrite = vi.spyOn(Storage.prototype, 'setItem');
  recent.record(2);
  expect(recoveredWrite).not.toHaveBeenCalled();
  expect(recent.storageWarning()).toBe(unsaved);
  recent.record(17);
  expect(recent.storageWarning()).toBeNull();
  expect(fresh().productIds()).toEqual([17, 2]);
});

// 清除失敗必須保留舊儲存的事實，空記憶體仍能再次清除。
it('clears memory but warns when persisted history cannot be removed', () => {
  const recent = fresh();
  recent.record(17);
  const raw = localStorage.getItem(key);
  const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  recent.clear();
  expect(recent.productIds()).toEqual([]);
  expect(recent.storageWarning()).toBe(uncleared);
  expect(localStorage.getItem(key)).toBe(raw);
  remove.mockRestore();
  recent.clear();
  expect(recent.storageWarning()).toBeNull();
  expect(localStorage.getItem(key)).toBeNull();
  expect(fresh().productIds()).toEqual([]);
});

// 寫入與清除只能操作本key，不能觸碰其他選品資料。
it('persists only IDs and clears only history, leaving cart and favorites intact', () => {
  const others = ['skinet.cart.v1', 'skinet.favorites.v1'];
  const originals = others.map(other => localStorage.getItem(other));
  localStorage.setItem(others[0], '{"version":1,"items":[{"productId":17,"quantity":3}]}');
  localStorage.setItem(others[1], '{"version":1,"productIds":[2]}');
  const snapshots = others.map(other => localStorage.getItem(other));
  const recent = fresh();
  recent.record(2);
  recent.record(17);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, productIds: [17, 2] });
  expect(fresh().productIds()).toEqual([17, 2]);
  expect(others.map(other => localStorage.getItem(other))).toEqual(snapshots);
  recent.clear();
  expect(localStorage.getItem(key)).toBeNull();
  expect(recent.productIds()).toEqual([]);
  expect(recent.storageWarning()).toBeNull();
  expect(fresh().productIds()).toEqual([]);
  expect(others.map(other => localStorage.getItem(other))).toEqual(snapshots);
  others.forEach((other, index) => {
    const original = originals[index];
    if (original === null) localStorage.removeItem(other);
    else localStorage.setItem(other, original);
  });
});
