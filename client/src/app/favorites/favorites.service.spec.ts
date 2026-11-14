import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';

const key = 'skinet.favorites.v1';
const unsaved = '收藏暫時無法儲存，重新整理後可能遺失';
const unreadable = '儲存的收藏資料無法讀取，已使用空清單';

// 每例只清理收藏資料，不清除其他功能的儲存內容。
beforeEach(() => localStorage.removeItem(key));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(key);
});

// 建立新的root service模擬重新開啟網站。
function fresh(): FavoritesService {
  TestBed.resetTestingModule();
  return TestBed.inject(FavoritesService);
}

it('starts empty and maintains unique newest-first favorites on toggles', () => {
  const favorites = fresh();
  expect(favorites.productIds()).toEqual([]);
  expect(favorites.count()).toBe(0);
  expect(favorites.storageWarning()).toBeNull();
  favorites.toggle(17);
  favorites.toggle(2);
  expect(favorites.productIds()).toEqual([2, 17]);
  expect(favorites.count()).toBe(2);
  expect(favorites.has(17)).toBe(true);
  expect(favorites.feedback()).toBe('已加入收藏，目前共 2 項');
  favorites.toggle(17);
  expect(favorites.productIds()).toEqual([2]);
  expect(favorites.feedback()).toBe('已取消收藏，目前共 1 項');
  favorites.toggle(17);
  expect(favorites.productIds()).toEqual([17, 2]);
  favorites.remove(17);
  expect(favorites.has(17)).toBe(false);
  expect(favorites.productIds()).toEqual([2]);
});

it('persists only IDs and restores order without touching the cart', () => {
  const cartKey = 'skinet.cart.v1';
  const originalCart = localStorage.getItem(cartKey);
  const cart = '{"version":1,"items":[{"productId":17,"quantity":3}]}';
  localStorage.setItem(cartKey, cart);
  const favorites = fresh();
  favorites.toggle(2);
  favorites.toggle(17);
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, productIds: [17, 2] });
  expect(fresh().productIds()).toEqual([17, 2]);
  expect(localStorage.getItem(cartKey)).toBe(cart);
  if (originalCart === null) localStorage.removeItem(cartKey);
  else localStorage.setItem(cartKey, originalCart);
});

it('filters invalid stored IDs and duplicates while retaining order', () => {
  localStorage.setItem(key, JSON.stringify({
    version: 1, productIds: [17, 2, 17, 0, '3', null, 1.2, -1, Number.MAX_SAFE_INTEGER + 1]
  }));
  expect(fresh().productIds()).toEqual([17, 2]);
});

it.each(['{', 'null', '{"version":2,"productIds":[17]}', '{"version":1,"productIds":{}}'])(
  'shows a warning instead of accepting corrupt storage: %s', raw => {
    localStorage.setItem(key, raw);
    const favorites = fresh();
    expect(favorites.productIds()).toEqual([]);
    expect(favorites.storageWarning()).toBe(unreadable);
  }
);

it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'does not mutate or persist invalid ID %s', id => {
    const favorites = fresh();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    favorites.toggle(id);
    expect(favorites.productIds()).toEqual([]);
    expect(favorites.feedback()).toBe('');
    expect(write).not.toHaveBeenCalled();
  }
);

it('does not save or change feedback when removing an absent ID', () => {
  const favorites = fresh();
  favorites.toggle(17);
  const feedback = favorites.feedback();
  const write = vi.spyOn(Storage.prototype, 'setItem');
  favorites.remove(2);
  expect(write).not.toHaveBeenCalled();
  expect(favorites.feedback()).toBe(feedback);
});

it('keeps session actions usable after a storage read failure', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  const favorites = fresh();
  expect(favorites.storageWarning()).toBe(unsaved);
  read.mockRestore();
  favorites.toggle(17);
  expect(favorites.productIds()).toEqual([17]);
  expect(favorites.storageWarning()).toBeNull();
  favorites.remove(17);
  expect(favorites.productIds()).toEqual([]);
});

it('retains in-memory operations on write failure and clears warning on recovery', () => {
  const favorites = fresh();
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  favorites.toggle(17);
  favorites.toggle(2);
  expect(favorites.productIds()).toEqual([2, 17]);
  expect(favorites.storageWarning()).toBe(unsaved);
  favorites.remove(17);
  expect(favorites.productIds()).toEqual([2]);
  expect(favorites.storageWarning()).toBe(unsaved);
  write.mockRestore();
  favorites.toggle(3);
  expect(favorites.storageWarning()).toBeNull();
  expect(fresh().productIds()).toEqual([3, 2]);
});
