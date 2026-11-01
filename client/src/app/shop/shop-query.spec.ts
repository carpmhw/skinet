import { convertToParamMap } from '@angular/router';
import { parseShopQuery, toShopParams } from './shop-query';

describe('shop query contract', () => {
  it('serializes the default query to an empty params object', () => {
    expect(toShopParams(parseShopQuery(convertToParamMap({})))).toEqual({});
  });

  it('trims the search term and drops a blank search', () => {
    expect(parseShopQuery(convertToParamMap({ search: '  Angular  ' })).search).toBe('Angular');
    expect(toShopParams(parseShopQuery(convertToParamMap({ search: '   ' })))).toEqual({});
  });

  it('rejects malformed numbers instead of parsing their prefix', () => {
    for (const brandId of ['2oops', '-1', '1.5', 'Infinity', '0', '9007199254740993']) {
      expect(parseShopQuery(convertToParamMap({ brandId })).brandId).toBeNull();
    }
  });

  it('keeps an unknown sort out of the query state', () => {
    expect(parseShopQuery(convertToParamMap({ sort: 'price' })).sort).toBe('name');
    expect(toShopParams(parseShopQuery(convertToParamMap({ sort: 'price' })))).toEqual({});
  });

  it('keeps a selected id while its options are not available yet', () => {
    expect(parseShopQuery(convertToParamMap({ brandId: '1' })).brandId).toBe(1);
    expect(parseShopQuery(convertToParamMap({ brandId: '1' }), {}).brandId).toBe(1);
  });

  it('drops a selected id that the loaded options do not contain', () => {
    expect(
      parseShopQuery(convertToParamMap({ brandId: '1' }), { brandIds: [] }).brandId,
    ).toBeNull();
    expect(
      parseShopQuery(convertToParamMap({ brandId: '1' }), { brandIds: [2, 3] }).brandId,
    ).toBeNull();
    expect(
      parseShopQuery(convertToParamMap({ brandId: '2' }), { brandIds: [2, 3] }).brandId,
    ).toBe(2);
  });

  it('round-trips a normalized query through the url contract', () => {
    const query = {
      search: 'Core',
      brandId: 2,
      typeId: 3,
      sort: 'priceAsc' as const,
      pageIndex: 4,
    };
    expect(parseShopQuery(convertToParamMap(toShopParams(query)))).toEqual(query);
  });

  it('omits default values from the serialized url', () => {
    expect(
      toShopParams({ search: '', brandId: null, typeId: null, sort: 'name', pageIndex: 1 }),
    ).toEqual({});
  });
});
