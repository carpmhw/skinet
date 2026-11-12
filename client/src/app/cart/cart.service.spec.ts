import { vi } from 'vitest';
import { CartService } from './cart.service';

const key = 'skinet.cart.v1';

// 使用真實儲存邊界驗證購物車狀態與復原行為。
describe('CartService', () => {
  // 每個案例只清理購物車自己的 key。
  beforeEach(() => localStorage.removeItem(key));
  // 還原故障注入，避免其他案例繼承失敗狀態。
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(key);
    localStorage.removeItem('cart-test-other');
  });

  // 缺省資料不應被當成壞損或主動寫入。
  it('starts empty without a warning or writing a missing key', () => {
    const cart = new CartService();
    expect(cart.items()).toEqual([]);
    expect(cart.totalQuantity()).toBe(0);
    expect(cart.storageWarning()).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  // 驗證合併、數量、順序及寫回欄位。
  it('merges items, changes quantities, removes and restores only ids and quantities', () => {
    const cart = new CartService();
    expect(cart.add(2)).toBe(true);
    cart.add(1);
    cart.add(2);
    expect(cart.items()).toEqual([{ productId: 2, quantity: 2 }, { productId: 1, quantity: 1 }]);
    expect(cart.totalQuantity()).toBe(3);
    expect(cart.setQuantity(1, 4)).toBe(true);
    expect(new CartService().items()).toEqual([{ productId: 2, quantity: 2 }, { productId: 1, quantity: 4 }]);
    cart.remove(2);
    expect(cart.totalQuantity()).toBe(4);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, items: [{ productId: 1, quantity: 4 }] });
    cart.remove(1);
    expect(new CartService().items()).toEqual([]);
  });

  // 非法改量不能移除商品，也不能污染有效狀態。
  it('rejects invalid ids and quantities and enforces the 99 limit', () => {
    const cart = new CartService();
    for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(cart.add(id)).toBe(false);
    }
    cart.add(1);
    for (const quantity of [0, -1, 1.5, NaN, Infinity, 100]) {
      expect(cart.setQuantity(1, quantity)).toBe(false);
      expect(cart.items()).toEqual([{ productId: 1, quantity: 1 }]);
    }
    expect(cart.setQuantity(2, 5)).toBe(false);
    cart.remove(2);
    cart.setQuantity(1, 99);
    expect(cart.add(1)).toBe(false);
    expect(cart.totalQuantity()).toBe(99);
  });

  // 讀取不可信儲存值時只留下合法欄位，重複商品依首次順序合併。
  it('normalizes valid stored rows while skipping invalid rows and capping duplicates', () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, items: [
      { productId: 2, quantity: 1, price: 999 },
      { productId: 1, quantity: 60 }, { productId: 1, quantity: 60 },
      null, 'invalid', { productId: 0, quantity: 1 }, { productId: 3, quantity: 100 },
      { productId: 4, quantity: 1.5 }, { productId: '5', quantity: 1 },
    ] }));
    const cart = new CartService();
    expect(cart.items()).toEqual([{ productId: 2, quantity: 1 }, { productId: 1, quantity: 99 }]);
    expect(cart.totalQuantity()).toBe(100);
    cart.add(3);
    expect(JSON.parse(localStorage.getItem(key)!).items[0]).toEqual({ productId: 2, quantity: 1 });
  });

  // 根結構或版本損壞時不悄悄覆寫原資料。
  it('reports corrupt roots without touching other storage or overwriting until an edit', () => {
    localStorage.setItem('cart-test-other', 'kept');
    for (const raw of ['{', 'null', '[]', '{"version":2,"items":[]}', '{"version":1,"items":{}}']) {
      localStorage.setItem(key, raw);
      const cart = new CartService();
      expect(cart.items()).toEqual([]);
      expect(cart.storageWarning()).toBe('儲存的購物車資料無法讀取，已使用空購物車');
      expect(localStorage.getItem(key)).toBe(raw);
      cart.add(1);
      expect(cart.storageWarning()).toBeNull();
    }
    expect(localStorage.getItem('cart-test-other')).toBe('kept');
  });

  // 存取被拒時仍允許本次頁面在記憶體操作。
  it('survives a denied localStorage getter', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied'); });
    const cart = new CartService();
    expect(cart.add(1)).toBe(true);
    expect(cart.items()).toEqual([{ productId: 1, quantity: 1 }]);
    expect(cart.storageWarning()).toBe('購物車暫時無法儲存，重新整理後可能遺失');
  });

  // 讀取與寫入例外只在邊界攔截，下一次儲存成功可恢復。
  it('survives read and write failures and clears the warning after a successful save', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied'); });
    const cart = new CartService();
    expect(cart.storageWarning()).toContain('暫時無法儲存');
    vi.restoreAllMocks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota'); });
    expect(cart.add(1)).toBe(true);
    expect(cart.totalQuantity()).toBe(1);
    expect(cart.storageWarning()).toContain('暫時無法儲存');
    vi.restoreAllMocks();
    cart.add(1);
    expect(cart.storageWarning()).toBeNull();
    expect(new CartService().totalQuantity()).toBe(2);
  });
});
