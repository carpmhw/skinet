import { ParamMap, Params } from '@angular/router';

export type ShopSort = 'name' | 'priceAsc' | 'priceDesc';

export interface ShopQuery {
  search: string;
  brandId: number | null;
  typeId: number | null;
  sort: ShopSort;
  pageIndex: number;
}

export interface ProductLookup {
  id: number;
  name: string;
}

export interface LookupIds {
  brandIds?: readonly number[];
  typeIds?: readonly number[];
}

const SORTS: readonly ShopSort[] = ['name', 'priceAsc', 'priceDesc'];

// 將單一網址參數解析為正整數，格式不符或超出安全整數時回傳 null。
function parsePositiveInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// 解析商品路由的 id，無效值不應送往 API。
export function parseProductId(value: string | null): number | null {
  return parsePositiveInt(value);
}

// 依可用選項驗證 ID：選項尚未載入時保留，已載入則必須存在於清單。
function parseLookupId(value: string | null, available?: readonly number[]): number | null {
  const id = parsePositiveInt(value);
  if (id === null || available === undefined) {
    return id;
  }
  return available.includes(id) ? id : null;
}

// 將網址參數正規化為頁面唯一信任的查詢狀態。
export function parseShopQuery(params: ParamMap, ids: LookupIds = {}): ShopQuery {
  const sortValue = params.get('sort') as ShopSort | null;
  return {
    search: (params.get('search') ?? '').trim(),
    brandId: parseLookupId(params.get('brandId'), ids.brandIds),
    typeId: parseLookupId(params.get('typeId'), ids.typeIds),
    sort: sortValue !== null && SORTS.includes(sortValue) ? sortValue : 'name',
    pageIndex: parsePositiveInt(params.get('pageIndex')) ?? 1,
  };
}

// 只把非預設條件寫入網址，讓可分享的網址保持精簡。
export function toShopParams(query: ShopQuery): Params {
  const params: Params = {};
  if (query.search) {
    params['search'] = query.search;
  }
  if (query.brandId !== null) {
    params['brandId'] = query.brandId;
  }
  if (query.typeId !== null) {
    params['typeId'] = query.typeId;
  }
  if (query.sort !== 'name') {
    params['sort'] = query.sort;
  }
  if (query.pageIndex !== 1) {
    params['pageIndex'] = query.pageIndex;
  }
  return params;
}
