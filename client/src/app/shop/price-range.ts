export interface ValidPriceRange {
  valid: true;
  minPriceCents: number | null;
  maxPriceCents: number | null;
}

export interface PriceErrors {
  minPrice?: string;
  maxPrice?: string;
}

export interface InvalidPriceRange {
  valid: false;
  minPriceInput: string;
  maxPriceInput: string;
  errors: PriceErrors;
}

// 價格只在入口解析一次；保留錯誤原字串，合法值向內一律使用整數分。
export function parsePriceRange(
  minPrice: string | null, maxPrice: string | null,
): ValidPriceRange | InvalidPriceRange {
  const inputs = { minPrice: minPrice ?? '', maxPrice: maxPrice ?? '' };
  const cents: { minPrice: number | null; maxPrice: number | null } = { minPrice: null, maxPrice: null };
  const errors: PriceErrors = {};
  for (const key of ['minPrice', 'maxPrice'] as const) {
    const input = inputs[key].trim();
    if (input === '') continue;
    const parts = input.split('.');
    const value = Number(parts[0]) * 100 + Number((parts[1] ?? '').padEnd(2, '0'));
    if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input) ||
        !Number.isSafeInteger(value) || value > 9999999999) {
      errors[key] = '請輸入0至99,999,999.99之間的金額，最多兩位小數';
    } else {
      cents[key] = value;
    }
  }
  if (cents.minPrice !== null && cents.maxPrice !== null && cents.minPrice > cents.maxPrice) {
    errors.minPrice = '最低價格不可高於最高價格';
  }
  if (errors.minPrice || errors.maxPrice) {
    return { valid: false, minPriceInput: inputs.minPrice, maxPriceInput: inputs.maxPrice, errors };
  }
  return { valid: true, minPriceCents: cents.minPrice, maxPriceCents: cents.maxPrice };
}

// 以整數商與餘數輸出精簡十進位金額，不使用浮點四捨五入。
export function formatPriceCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}
