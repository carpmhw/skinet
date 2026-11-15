import { formatPriceCents, parsePriceRange } from './price-range';

// 固定金額合約，避免浮點四捨五入、格式放寬或零被當成未填。
describe('price range boundary', () => {
  // 每個合法數字皆須精確轉成整數分。
  it.each([
    [null, null], ['', null], ['   ', null], ['0', 0], ['0.00', 0],
    [' 0019.90 ', 1990], ['19.99', 1999], ['20.01', 2001],
    ['99999999.99', 9999999999],
  ])('parses %s without rounding', (input, cents) => {
    expect(parsePriceRange(input, null)).toEqual({
      valid: true, minPriceCents: cents, maxPriceCents: null,
    });
    expect(parsePriceRange(null, input)).toEqual({
      valid: true, minPriceCents: null, maxPriceCents: cents,
    });
  });

  // 兩側均不能接受錯誤格式、超限或科學記號。
  it.each(['-1', '+1', '1,000', '$1', '1e2', 'NaN', 'Infinity', '.', '.5', '1.',
    '1.001', '100000000', '999999999999999999999999999999999999999'])(
    'retains invalid input %s for correction', input => {
      const min = parsePriceRange(input, null);
      const max = parsePriceRange(null, input);
      expect(min.valid).toBe(false);
      expect(max.valid).toBe(false);
      if (min.valid === false && max.valid === false) {
        expect(min.minPriceInput).toBe(input);
        expect(min.errors.minPrice).toBeTruthy();
        expect(max.maxPriceInput).toBe(input);
        expect(max.errors.maxPrice).toBeTruthy();
      }
    },
  );

  // 相等合法、反轉不能自動交換。
  it('accepts equal bounds and rejects a reversed range', () => {
    expect(parsePriceRange('19.99', '19.99')).toEqual({
      valid: true, minPriceCents: 1999, maxPriceCents: 1999,
    });
    expect(parsePriceRange('20.01', '20')).toMatchObject({
      valid: false, errors: { minPrice: '最低價格不可高於最高價格' },
    });
  });

  // 網址只保留必要小數，且精確保持分的位數。
  it.each([[0, '0'], [1900, '19'], [1990, '19.9'], [1999, '19.99'],
    [2001, '20.01'], [9999999999, '99999999.99']])(
    'formats %s cents as %s', (cents, expected) => expect(formatPriceCents(cents)).toBe(expected),
  );
});
