import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { CartService } from '../cart/cart.service';
import { FavoritesService } from '../favorites/favorites.service';
import { NavBarComponent } from './nav-bar.component';

describe('NavBarComponent favorites', () => {
  let originalCart: string | null;
  const key = 'skinet.favorites.v1';

  // 隔離收藏與購物車fixture，但在測試結束還原原有購物車內容。
  beforeEach(() => {
    originalCart = localStorage.getItem('skinet.cart.v1');
    localStorage.removeItem(key);
    localStorage.removeItem('skinet.cart.v1');
    TestBed.configureTestingModule({
      declarations: [NavBarComponent], imports: [RouterModule],
      providers: [provideZoneChangeDetection(), provideRouter([])]
    });
  });

  // 還原Storage外部邊界與測試資料，不影響其他功能。
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(key);
    if (originalCart === null) localStorage.removeItem('skinet.cart.v1');
    else localStorage.setItem('skinet.cart.v1', originalCart);
  });

  it('updates the favorites navigation count without changing cart quantities', () => {
    const fixture = TestBed.createComponent(NavBarComponent);
    const favorites = TestBed.inject(FavoritesService);
    TestBed.inject(CartService).add(17);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a[href="/favorites"]') as HTMLAnchorElement;
    expect(link.textContent).toContain('收藏（0）');
    favorites.toggle(17);
    favorites.toggle(2);
    fixture.detectChanges();
    expect(link.textContent).toContain('收藏（2）');
    expect(fixture.nativeElement.querySelector('a[href="/cart"]').textContent).toContain('購物車（1）');
    favorites.remove(17);
    fixture.detectChanges();
    expect(link.textContent).toContain('收藏（1）');
    expect(fixture.nativeElement.querySelectorAll('[role="status"]').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('已取消收藏');
  });

  it('uses one visible polite region for action feedback and storage warnings', () => {
    const fixture = TestBed.createComponent(NavBarComponent);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    TestBed.inject(FavoritesService).toggle(17);
    fixture.detectChanges();
    const regions = fixture.nativeElement.querySelectorAll('[role="status"]');
    expect(regions.length).toBe(1);
    expect(regions[0].textContent).toContain('已加入收藏，目前共 1 項');
    expect(regions[0].textContent).toContain('收藏暫時無法儲存，重新整理後可能遺失');
  });
});
