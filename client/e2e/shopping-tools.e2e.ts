import { expect, type Locator, type Page, test } from '@playwright/test';

// 期望值取自 Infrastructure/Data/SeedData/products.json：商品 15 Core Red Boots NT$189.99。

// 取得網站導覽中的指定連結；計數文字也從這裡斷言。
function navLink(page: Page, name: RegExp): Locator {
  return page.getByRole('navigation', { name: '網站導覽' }).getByRole('link', { name });
}

// 開啟商品詳情並等待商品標題出現，確保詳情成功載入。
async function openDetail(page: Page, id: number, name: string): Promise<void> {
  await page.goto(`/shop/${id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('keeps favorites after reload and clears them on removal', async ({ page }) => {
  await page.goto('/shop');
  const toggle = page.getByRole('button', { name: '收藏Angular Blue Boots' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(navLink(page, /^收藏/)).toHaveText('收藏（1）');
  await page.reload();
  await expect(navLink(page, /^收藏/)).toHaveText('收藏（1）');
  await navLink(page, /^收藏/).click();
  await expect(page.locator('.favorite-row')).toHaveCount(1);
  await expect(page.locator('.favorite-row')).toContainText('Angular Blue Boots');
  await page.getByRole('button', { name: '移除收藏 Angular Blue Boots' }).click();
  await expect(navLink(page, /^收藏/)).toHaveText('收藏（0）');
  await expect(page.locator('.empty-favorites')).toBeVisible();
  await page.reload();
  await expect(navLink(page, /^收藏/)).toHaveText('收藏（0）');
});

test('orders recently viewed newest first and clears history', async ({ page }) => {
  // 瀏覽順序 15→1→4，最新在前應為 4→1→15；與名稱或 id 的升冪、降冪排序都不同。
  await openDetail(page, 15, 'Core Red Boots');
  await openDetail(page, 1, 'Angular Speedster Board 2000');
  await openDetail(page, 4, 'Net Core Super Board');
  await navLink(page, /^最近瀏覽/).click();
  const rows = page.locator('.recent-row .recent-product-title');
  const newestFirst = ['Net Core Super Board', 'Angular Speedster Board 2000', 'Core Red Boots'];
  await expect(rows).toHaveText(newestFirst);
  await page.reload();
  await expect(rows).toHaveText(newestFirst);
  await page.getByRole('button', { name: '清除瀏覽紀錄' }).click();
  await expect(page.locator('.empty-history')).toBeVisible();
  await page.reload();
  await expect(page.locator('.empty-history')).toBeVisible();
  await expect(page.locator('.recent-row')).toHaveCount(0);
});

test('persists cart quantity and totals across reload', async ({ page }) => {
  await openDetail(page, 15, 'Core Red Boots');
  await page.locator('.add-to-cart').click();
  await expect(navLink(page, /^購物車/)).toHaveText('購物車（1）');
  await navLink(page, /^購物車/).click();
  const quantity = page.locator('#quantity-15');
  await expect(quantity).toBeEnabled();
  await quantity.fill('3');
  await quantity.press('Enter');
  await expect(page.locator('.line-subtotal')).toContainText('NT$569.97');
  await expect(page.locator('.cart-total')).toContainText('NT$569.97');
  await expect(navLink(page, /^購物車/)).toHaveText('購物車（3）');
  await page.reload();
  await expect(quantity).toHaveValue('3');
  await expect(page.locator('.cart-total')).toContainText('NT$569.97');
  await quantity.fill('0');
  await quantity.press('Enter');
  await expect(page.getByText('請輸入 1–99 的整數')).toBeVisible();
  await expect(quantity).toHaveAttribute('aria-invalid', 'true');
  // 被拒絕的數量不可寫入：欄位、總額與導覽計數都維持 3 件。
  await expect(quantity).toHaveValue('3');
  await expect(page.locator('.cart-total')).toContainText('NT$569.97');
  await expect(navLink(page, /^購物車/)).toHaveText('購物車（3）');
  await page.getByRole('button', { name: '移除 Core Red Boots' }).click();
  await expect(page.locator('.empty-cart')).toBeVisible();
  await expect(navLink(page, /^購物車/)).toHaveText('購物車（0）');
});

// 依序點選列表上的比較按鈕；全程不重新載入，比較只存在記憶體。
async function compare(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await page.getByRole('button', { name: `比較${name}` }).click();
  }
}

// 量測頁面層級的水平溢出像素，0 以下代表沒有溢出。
function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// 刻意不照列表的名稱順序點選，才能區分「依選取順序」與名稱／id 排序。
const firstThree = ['Angular Speedster Board 2000', 'Angular Blue Boots', 'Angular Purple Boots'];

test('limits comparison to three and clears it on reload', async ({ page }) => {
  await page.goto('/shop');
  await compare(page, firstThree);
  await expect(navLink(page, /^比較/)).toHaveText('比較（3）');
  const fourth = page.getByRole('button', { name: '比較Blue Code Gloves' });
  await fourth.click();
  await expect(fourth).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('最多比較3件商品，請先移除一件')).toBeVisible();
  await expect(navLink(page, /^比較/)).toHaveText('比較（3）');
  await navLink(page, /^比較/).click();
  const titles = page.locator('.comparison-product-title');
  await expect(titles).toHaveText(firstThree);
  await page.getByRole('button', { name: '移除比較 Angular Blue Boots' }).click();
  await expect(titles).toHaveText(['Angular Speedster Board 2000', 'Angular Purple Boots']);
  await expect(navLink(page, /^比較/)).toHaveText('比較（2）');
  // 此案例未使用收藏、最近瀏覽與購物車，兩種 storage 都應該完全沒有資料。
  const keys = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
  expect(keys).toEqual([]);
  await page.reload();
  await expect(page.locator('.empty-comparison')).toBeVisible();
  await expect(navLink(page, /^比較/)).toHaveText('比較（0）');
});

test('fits narrow screens and scrolls the comparison table', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', '只在 375px 驗證');
  await openDetail(page, 1, 'Angular Speedster Board 2000');
  await page.locator('.add-to-cart').click();
  await page.getByRole('button', { name: '收藏Angular Speedster Board 2000' }).click();
  await navLink(page, /^商品目錄/).click();
  await compare(page, firstThree);
  await expect(navLink(page, /^比較/)).toHaveText('比較（3）');
  for (const [name, ready] of [
    [/^收藏/, '.favorite-row'], [/^最近瀏覽/, '.recent-row'],
    [/^購物車/, '.cart-total'], [/^比較/, '.comparison-product-title'],
  ] as const) {
    await navLink(page, name).click();
    await expect(page.locator(ready).first()).toBeVisible();
    // 等圖片等資源載入完成後再量，避免晚到的內容撐開版面卻沒被量到。
    await page.waitForLoadState('networkidle');
    expect(await pageOverflow(page), `${name}`).toBeLessThanOrEqual(0);
  }
  const scroller = page.locator('.comparison-scroll');
  const size = await scroller.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(size.scroll).toBeGreaterThan(size.client);
  await scroller.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});
