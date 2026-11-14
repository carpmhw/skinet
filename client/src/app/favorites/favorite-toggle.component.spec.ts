import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FavoriteToggleComponent } from './favorite-toggle.component';
import { FavoritesService } from './favorites.service';

// 每例隔離自己的收藏資料，使用真service及真按鈕。
beforeEach(() => {
  localStorage.removeItem('skinet.favorites.v1');
  TestBed.configureTestingModule({
    declarations: [FavoriteToggleComponent],
    providers: [provideZoneChangeDetection()]
  });
});
afterEach(() => localStorage.removeItem('skinet.favorites.v1'));

it('shares pressed state between native toggles while keeping their accessible names stable', () => {
  const fixtures = [TestBed.createComponent(FavoriteToggleComponent), TestBed.createComponent(FavoriteToggleComponent)];
  for (const fixture of fixtures) {
    fixture.componentRef.setInput('productId', 17);
    fixture.componentRef.setInput('productName', 'Angular board');
    fixture.detectChanges();
  }
  const buttons = fixtures.map(fixture => fixture.nativeElement.querySelector('button') as HTMLButtonElement);
  expect(buttons.length).toBe(2);
  for (const button of buttons) {
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('收藏Angular board');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('收藏');
  }
  buttons[0].click();
  for (const fixture of fixtures) fixture.detectChanges();
  expect(TestBed.inject(FavoritesService).productIds()).toEqual([17]);
  for (const button of buttons) expect(button.getAttribute('aria-pressed')).toBe('true');
  buttons[1].click();
  for (const fixture of fixtures) fixture.detectChanges();
  expect(TestBed.inject(FavoritesService).productIds()).toEqual([]);
  for (const button of buttons) {
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('收藏Angular board');
  }
  for (const fixture of fixtures) {
    expect(fixture.nativeElement.querySelector('[role="status"], [aria-live]')).toBeNull();
  }
});
