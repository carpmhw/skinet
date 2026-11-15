import { ChangeDetectorRef, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap, Params, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { IPagination } from '../models/pagination';
import { IProduct } from '../models/product';
import { parseShopQuery, ProductLookup, ShopQuery, ShopSort, toShopParams } from './shop-query';
import { ShopService } from './shop.service';
import { formatPriceCents, parsePriceRange, PriceErrors, ValidPriceRange } from './price-range';

type LookupState = 'loading' | 'ready' | 'error';

const QUERY_KEYS = ['search', 'brandId', 'typeId', 'sort', 'pageIndex', 'minPrice', 'maxPrice'] as const;

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss'],
  standalone: false,
})
export class ProductListComponent implements OnInit, OnDestroy {
  readonly pageSize = 6;
  readonly skeletonItems = [1, 2, 3, 4, 5, 6];

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shop = inject(ShopService);
  private readonly title = inject(Title);
  private readonly changeDetector = inject(ChangeDetectorRef);
  @ViewChild('minPriceField') private minPriceField?: ElementRef<HTMLInputElement>;
  @ViewChild('maxPriceField') private maxPriceField?: ElementRef<HTMLInputElement>;

  query: ShopQuery = {
    search: '', brandId: null, typeId: null, sort: 'name', pageIndex: 1,
    valid: true, minPriceCents: null, maxPriceCents: null,
  };
  searchTerm = '';
  minPriceInput = '';
  maxPriceInput = '';
  priceErrors: PriceErrors = {};
  priceNotApplied = false;
  filtersOpen = true;
  products: IProduct[] = [];
  count = 0;
  loading = false;
  error = false;

  brands: ProductLookup[] = [];
  types: ProductLookup[] = [];
  brandState: LookupState = 'loading';
  typeState: LookupState = 'loading';

  private brandIds?: readonly number[];
  private typeIds?: readonly number[];
  private lastParams?: ParamMap;
  private hasLoaded = false;
  private querySub?: Subscription;
  private brandSub?: Subscription;
  private typeSub?: Subscription;
  private requestSub?: Subscription;

  // 先載入篩選選項並訂閱網址，讓網址成為查詢狀態的唯一來源。
  ngOnInit(): void {
    this.filtersOpen = !this.isNarrowScreen();
    this.loadBrands();
    this.loadTypes();
    this.querySub = this.route.queryParamMap.subscribe(params => this.applyParams(params));
  }

  // 釋放頁面所有訂閱，包含尚未完成的商品請求。
  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
    this.brandSub?.unsubscribe();
    this.typeSub?.unsubscribe();
    this.requestSub?.unsubscribe();
  }

  get lastPage(): number {
    return Math.max(1, Math.ceil(this.count / this.pageSize));
  }

  get rangeStart(): number {
    return this.count === 0 ? 0 : (this.query.pageIndex - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.count, this.query.pageIndex * this.pageSize);
  }

  // 只顯示目前頁附近的五個頁碼，避免大目錄產生過長分頁列。
  get pageNumbers(): number[] {
    const total = this.lastPage;
    if (total <= 5) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }
    const start = Math.min(Math.max(this.query.pageIndex - 2, 1), total - 4);
    return Array.from({ length: 5 }, (_, index) => start + index);
  }

  // 價格零或非法價格同樣屬於可清除的條件，不能以 truthy 判斷。
  get hasConditions(): boolean {
    return (
      this.query.search !== '' ||
      this.query.brandId !== null ||
      this.query.typeId !== null ||
      this.query.sort !== 'name' ||
      this.query.valid === false ||
      this.query.minPriceCents !== null ||
      this.query.maxPriceCents !== null
    );
  }

  // 詳情連結沿用目前正規化條件，返回時可重建同一個列表。
  get detailQueryParams(): Params {
    return toShopParams(this.query);
  }

  // 草稿、已套用價格或錯誤任一存在時，均提供獨立清除入口。
  get hasPrices(): boolean {
    return this.minPriceInput !== '' || this.maxPriceInput !== '' ||
      this.query.valid === false || this.query.minPriceCents !== null ||
      this.query.maxPriceCents !== null || this.priceNotApplied;
  }

  // 同步使用者手動展開／收合的原生狀態，讓之後的強制展開能真正改變綁定。
  onFiltersToggle(open: boolean): void {
    this.filtersOpen = open;
  }

  // 輸入時只清除已修正錯誤，不產生新提示或商品請求。
  editPrice(kind: 'minPrice' | 'maxPrice', value: string): void {
    if (kind === 'minPrice') this.minPriceInput = value;
    else this.maxPriceInput = value;
    if (!this.priceErrors.minPrice && !this.priceErrors.maxPrice) return;
    const range = parsePriceRange(this.minPriceInput, this.maxPriceInput);
    if (range.valid === true) this.priceErrors = {};
    else {
      if (!range.errors.minPrice) delete this.priceErrors.minPrice;
      if (!range.errors.maxPrice) delete this.priceErrors.maxPrice;
    }
  }

  // 提交才驗證草稿，錯誤保留已套用結果，合法則寫網址並回首頁。
  submitPriceRange(): void {
    const range = parsePriceRange(this.minPriceInput, this.maxPriceInput);
    if (range.valid === false) {
      this.showPriceErrors(range.errors);
      return;
    }
    this.resetPriceDraft(range);
    const query = { ...this.query, ...range, pageIndex: 1 };
    if (!this.sameQuery(query, this.query)) this.navigate(query);
  }

  // 只清價格與錯誤，其他已套用條件不變，亦支援非法價格網址。
  clearPrices(): void {
    const range: ValidPriceRange = { valid: true, minPriceCents: null, maxPriceCents: null };
    this.resetPriceDraft(range);
    const query = { ...this.query, ...range, pageIndex: 1 };
    if (!this.sameQuery(query, this.query)) this.navigate(query);
  }

  // 先渲染可見錯誤再聚焦，使輔助科技能讀到對應欄位說明。
  private showPriceErrors(errors: PriceErrors): void {
    this.priceErrors = { ...errors };
    this.priceNotApplied = true;
    this.filtersOpen = true;
    this.changeDetector.detectChanges();
    const field = errors.minPrice ? this.minPriceField : this.maxPriceField;
    field?.nativeElement.focus();
  }

  // 將合法已套用金額同步成草稿；同網址清除也不依賴路由事件。
  private resetPriceDraft(range: ValidPriceRange): void {
    this.minPriceInput = range.minPriceCents === null ? '' : formatPriceCents(range.minPriceCents);
    this.maxPriceInput = range.maxPriceCents === null ? '' : formatPriceCents(range.maxPriceCents);
    this.priceErrors = {};
    this.priceNotApplied = false;
  }

  // 以目前輸入值提交搜尋，並回到第一頁。
  submitSearch(): void {
    this.navigate({ ...this.query, search: this.searchTerm.trim(), pageIndex: 1 });
  }

  // 套用單選品牌或類型條件，並回到第一頁。
  setFilter(kind: 'brandId' | 'typeId', id: number | null): void {
    if (this.query[kind] === id) {
      return;
    }
    this.navigate({ ...this.query, [kind]: id, pageIndex: 1 });
  }

  // 切換排序方式，並回到第一頁。
  setSort(sort: ShopSort): void {
    if (this.query.sort === sort) {
      return;
    }
    this.navigate({ ...this.query, sort, pageIndex: 1 });
  }

  // 前往指定頁碼，超出範圍時停在有效的首頁或末頁。
  goToPage(page: number): void {
    const target = Math.min(Math.max(page, 1), this.lastPage);
    if (target === this.query.pageIndex) {
      return;
    }
    this.navigate({ ...this.query, pageIndex: target });
  }

  // 移除所有查詢條件並回到預設列表。
  clearFilters(): void {
    this.searchTerm = '';
    this.resetPriceDraft({ valid: true, minPriceCents: null, maxPriceCents: null });
    this.navigate({
      search: '', brandId: null, typeId: null, sort: 'name', pageIndex: 1,
      valid: true, minPriceCents: null, maxPriceCents: null,
    });
  }

  // 使用目前查詢重試商品列表。
  retryProducts(): void {
    if (this.loading) {
      return;
    }
    this.loadProducts();
  }
  // 依失敗的選項種類重新載入品牌或類型。
  retryLookup(kind: 'brands' | 'types'): void {
    if (kind === 'brands') {
      this.loadBrands();
    } else {
      this.loadTypes();
    }
  }

  // 將新條件寫回網址，統一由 queryParamMap 推動畫面更新。
  private navigate(query: ShopQuery, replaceUrl = false): void {
    if (query.valid === false) {
      this.showPriceErrors(query.errors);
      return;
    }
    void this.router.navigate(['/shop'], { queryParams: toShopParams(query), replaceUrl });
  }

  // 真正導航才還原價格草稿；選項校正只更新已套用查詢及網址。
  private applyParams(params: ParamMap, preservePriceDraft = false): void {
    this.lastParams = params;
    this.title.setTitle('商品目錄 | SkiNet');
    const query = parseShopQuery(params, { brandIds: this.brandIds, typeIds: this.typeIds });
    this.searchTerm = query.search;
    if (query.valid === true) this.syncUrl(query, params);

    if (this.hasLoaded && this.sameQuery(query, this.query)) {
      return;
    }
    this.query = query;
    if (!preservePriceDraft) {
      if (query.valid === true) {
        this.resetPriceDraft(query);
      } else {
        this.minPriceInput = query.minPriceInput;
        this.maxPriceInput = query.maxPriceInput;
        this.priceErrors = { ...query.errors };
        this.priceNotApplied = false;
        this.filtersOpen = true;
      }
    }
    this.loadProducts();
  }

  // 只在網址與正規化條件不同時 replace，避免歷史紀錄被無效參數汙染。
  private syncUrl(query: ShopQuery, params: ParamMap): void {
    const normalized = toShopParams(query);
    const unchanged = QUERY_KEYS.every(
      key => String(normalized[key] ?? '') === (params.get(key) ?? ''),
    );
    if (!unchanged) {
      void this.router.navigate(['/shop'], { queryParams: normalized, replaceUrl: true });
    }
  }

  // 以目前查詢取得列表，並取消尚未完成的舊請求。
  private loadProducts(): void {
    this.requestSub?.unsubscribe();
    if (this.query.valid === false) {
      this.products = [];
      this.count = 0;
      this.loading = false;
      this.error = false;
      this.hasLoaded = true;
      return;
    }
    this.loading = true;
    this.error = false;
    this.hasLoaded = true;

    this.requestSub = this.shop.getProducts(this.query).subscribe({
      next: response => this.applyPage(response),
      error: () => {
        this.loading = false;
        this.error = true;
        this.products = [];
        this.count = 0;
      },
    });
  }

  // 顯示商品頁；若頁碼超出結果範圍，以 replace 更正網址後重新查詢。
  private applyPage(response: IPagination): void {
    const lastPage = Math.max(1, Math.ceil(response.count / this.pageSize));
    if (response.count > 0 && this.query.pageIndex > lastPage) {
      this.navigate({ ...this.query, pageIndex: lastPage }, true);
      return;
    }
    if (response.count === 0 && this.query.pageIndex > 1) {
      this.navigate({ ...this.query, pageIndex: 1 }, true);
      return;
    }

    this.products = response.data;
    this.count = response.count;
    this.loading = false;
  }

  // 比較兩個正規化查詢是否代表同一個列表請求。
  private sameQuery(left: ShopQuery, right: ShopQuery): boolean {
    return (
      left.search === right.search &&
      left.brandId === right.brandId &&
      left.typeId === right.typeId &&
      left.sort === right.sort &&
      left.pageIndex === right.pageIndex &&
      (left.valid === true && right.valid === true
        ? left.minPriceCents === right.minPriceCents && left.maxPriceCents === right.maxPriceCents
        : left.valid === false && right.valid === false &&
          left.minPriceInput === right.minPriceInput && left.maxPriceInput === right.maxPriceInput)
    );
  }

  // 載入品牌選項；失敗時保留目前選取，其他列表功能仍可使用。
  private loadBrands(): void {
    this.brandSub?.unsubscribe();
    this.brandState = 'loading';
    this.brandSub = this.shop.getBrands().subscribe({
      next: brands => {
        this.brands = brands;
        this.brandIds = brands.map(brand => brand.id);
        this.brandState = 'ready';
        this.reapplyLastParams();
      },
      error: () => {
        this.brandState = 'error';
      },
    });
  }

  // 載入類型選項；失敗時保留目前選取，其他列表功能仍可使用。
  private loadTypes(): void {
    this.typeSub?.unsubscribe();
    this.typeState = 'loading';
    this.typeSub = this.shop.getTypes().subscribe({
      next: types => {
        this.types = types;
        this.typeIds = types.map(type => type.id);
        this.typeState = 'ready';
        this.reapplyLastParams();
      },
      error: () => {
        this.typeState = 'error';
      },
    });
  }

  // 延遲選項移除失效 ID 時保留價格草稿；後續 replaceUrl 同查詢不再重設。
  private reapplyLastParams(): void {
    if (this.lastParams) {
      this.applyParams(this.lastParams, true);
    }
  }

  // 手機預設收合篩選，讓第一批商品出現在首屏。
  private isNarrowScreen(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 600px)').matches
    );
  }
}
