import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ComparisonToggleComponent } from './comparison-toggle.component';
import { ComparisonService } from './comparison.service';

let mounted: HTMLElement[];

// 使用真元件與同root服務，不以宿主schema繞過元件宣告。
beforeEach(() => {
  mounted = [];
  TestBed.configureTestingModule({
    declarations: [ComparisonToggleComponent],
    providers: [provideZoneChangeDetection()]
  });
});

// 移除焦點測試掛載的DOM，不觸碰任何儲存資料。
afterEach(() => {
  for (const element of mounted) element.remove();
});

// 原生控制共享選取狀態，名稱不能隨選取改變或另加live region。
it('shares pressed state across native toggles with stable names', () => {
  const fixtures = [TestBed.createComponent(ComparisonToggleComponent), TestBed.createComponent(ComparisonToggleComponent)];
  for (const fixture of fixtures) {
    fixture.componentRef.setInput('productId', 17);
    fixture.componentRef.setInput('productName', 'Angular board');
    fixture.detectChanges();
  }
  const buttons = fixtures.map(fixture => fixture.nativeElement.querySelector('button') as HTMLButtonElement);
  for (const button of buttons) {
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('比較Angular board');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('比較');
  }
  buttons[0].click();
  for (const fixture of fixtures) fixture.detectChanges();
  expect(TestBed.inject(ComparisonService).productIds()).toEqual([17]);
  for (const button of buttons) expect(button.getAttribute('aria-pressed')).toBe('true');
  buttons[1].click();
  for (const fixture of fixtures) fixture.detectChanges();
  expect(TestBed.inject(ComparisonService).productIds()).toEqual([]);
  for (const button of buttons) {
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('比較Angular board');
  }
  for (const fixture of fixtures) expect(fixture.nativeElement.querySelector('[role="status"], [aria-live]')).toBeNull();
});

// 達上限不應disable未選控制或移走焦點，使用者仍能取消既有選取。
it('keeps the fourth toggle operable and focused while rejecting its selection', () => {
  const comparison = TestBed.inject(ComparisonService);
  for (const id of [17, 2, 3]) comparison.toggle(id);
  const fixture = TestBed.createComponent(ComparisonToggleComponent);
  fixture.componentRef.setInput('productId', 4);
  fixture.componentRef.setInput('productName', 'Fourth board');
  document.body.appendChild(fixture.nativeElement);
  mounted.push(fixture.nativeElement);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  button.focus();
  button.click();
  fixture.detectChanges();
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(comparison.productIds()).toEqual([17, 2, 3]);
  expect(comparison.feedback()).toBe('最多比較3件商品，請先移除一件');
  fixture.componentRef.setInput('productId', 17);
  fixture.detectChanges();
  expect(button.disabled).toBe(false);
  button.click();
  fixture.detectChanges();
  expect(comparison.productIds()).toEqual([2, 3]);
  expect(button.getAttribute('aria-pressed')).toBe('false');
});
