import { expect, type Page, test } from '@playwright/test';

// 期望值取自 Infrastructure/Data/SeedData/products.json：150–200 含界共 7 件。

// 窄螢幕預設收合篩選區，需先展開才能操作價格欄位。
async function openFilters(page: Page): Promise<void> {
  const details = page.locator('details.filters');
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) {
    await details.locator('summary').click();
  }
  await expect(page.locator('#min-price')).toBeVisible();
}

// 將目前網址的 query 轉為物件，避免依賴參數排列順序。
function query(page: Page): Record<string, string> {
  return Object.fromEntries(new URL(page.url()).searchParams);
}

// 在價格欄位輸入並以最高價格欄位的 Enter 送出。
async function submitPrices(page: Page, min: string, max: string): Promise<void> {
  await openFilters(page);
  await page.locator('#min-price').fill(min);
  await page.locator('#max-price').fill(max);
  await page.locator('#max-price').press('Enter');
}

test('submits price with Enter and filters via the real API', async ({ page }) => {
  await page.goto('/shop?pageIndex=2');
  await expect(page.locator('.result-count')).toContainText('共 18 件');
  await submitPrices(page, '150', '200');
  await expect.poll(() => query(page)).toEqual({ minPrice: '150', maxPrice: '200' });
  await expect(page.locator('.result-count')).toContainText('共 7 件');
  await expect(page.locator('article.product-card')).toHaveCount(6);
  const image = page.locator('article.product-card img').first();
  await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('keeps results and focuses the field when the draft is reversed', async ({ page }) => {
  await page.goto('/shop?minPrice=150&maxPrice=200');
  await expect(page.locator('.result-count')).toContainText('共 7 件');
  const url = page.url();
  await submitPrices(page, '200.01', '150');
  await expect(page.getByText('最低價格不可高於最高價格')).toBeVisible();
  await expect(page.getByText('價格尚未套用')).toBeVisible();
  await expect(page.locator('#min-price')).toBeFocused();
  await expect(page.locator('#min-price')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.result-count')).toContainText('共 7 件');
  expect(page.url()).toBe(url);
});

test('blocks an invalid price URL and recovers after clearing', async ({ page }) => {
  // 只記錄商品列表請求；品牌／類型選項仍應正常載入。
  const listRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/products') listRequests.push(request.url());
  });
  await page.goto('/shop?minPrice=1e2&search=Core');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('details.filters')).toHaveAttribute('open', '');
  await expect(page.locator('#min-price')).toHaveValue('1e2');
  await expect(page.locator('#min-price')).not.toBeFocused();
  expect(listRequests).toEqual([]);
  await expect(page.locator('.result-count')).toHaveCount(0);
  await expect(page.locator('article.product-card')).toHaveCount(0);
  await expect(page.locator('.pagination')).toHaveCount(0);
  await page.locator('.state-panel').getByRole('button', { name: '清除價格' }).click();
  await expect.poll(() => query(page)).toEqual({ search: 'Core' });
  await expect(page.locator('article.product-card').first()).toBeVisible();
  expect(listRequests.length).toBeGreaterThan(0);
});

test('keeps the price range across paging, detail and history', async ({ page }) => {
  await page.goto('/shop?minPrice=150&maxPrice=200');
  await expect(page.locator('.result-count')).toContainText('共 7 件');
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect.poll(() => query(page)).toEqual({ minPrice: '150', maxPrice: '200', pageIndex: '2' });
  await expect(page.locator('article.product-card')).toHaveCount(1);
  await page.locator('.product-link').first().click();
  await expect(page.locator('.back-link')).toBeVisible();
  await page.locator('.back-link').click();
  await expect.poll(() => query(page)).toEqual({ minPrice: '150', maxPrice: '200', pageIndex: '2' });
  await expect(page.locator('article.product-card')).toHaveCount(1);
  for (let step = 0; step < 3; step++) await page.goBack();
  await expect.poll(() => query(page)).toEqual({ minPrice: '150', maxPrice: '200' });
  await openFilters(page);
  await expect(page.locator('#min-price')).toHaveValue('150');
  await expect(page.locator('#max-price')).toHaveValue('200');
  await expect(page.locator('article.product-card')).toHaveCount(6);
});

test('reaches price controls in Tab order with visible focus', async ({ page }) => {
  await page.goto('/shop');
  await openFilters(page);
  await page.locator('#min-price').focus();
  /** 讀取目前焦點元素的 id 或 class 與外框樣式。 */
  const focused = () => page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    return { id: element.id || element.className, outline: getComputedStyle(element).outlineStyle };
  });
  for (const expected of ['max-price', 'apply-prices']) {
    await page.keyboard.press('Tab');
    const state = await focused();
    expect(state.id).toContain(expected);
    expect(state.outline).not.toBe('none');
  }
});

test('has no horizontal overflow on narrow screens', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '只在 375px 驗證');
  await page.goto('/shop?minPrice=150&maxPrice=200');
  await submitPrices(page, '200.01', '150');
  await expect(page.getByText('價格尚未套用')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('reopens filters collapsed by the visitor', async ({ page }) => {
  await page.goto('/shop?minPrice=bad');
  await page.locator('.state-panel').getByRole('button', { name: '清除價格' }).click();
  await expect.poll(() => query(page)).toEqual({});
  await page.locator('details.filters summary').click();
  await expect(page.locator('details.filters')).not.toHaveAttribute('open', '');
  await page.goBack();
  await expect.poll(() => query(page)).toEqual({ minPrice: 'bad' });
  await expect(page.locator('details.filters')).toHaveAttribute('open', '');
  await expect(page.locator('#min-price')).toHaveValue('bad');
  await expect(page.locator('#min-price')).not.toBeFocused();
});
