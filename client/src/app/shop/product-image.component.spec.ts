import { ComponentFixture } from '@angular/core/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProductImageComponent } from './product-image.component';

describe('ProductImageComponent', () => {
  let fixture: ComponentFixture<ProductImageComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ProductImageComponent],
      providers: [provideZoneChangeDetection()],
    }).compileComponents();
  });

  // 建立圖片元件並指定來源與替代文字。
  function render(src: string, alt = 'Angular board'): void {
    fixture = TestBed.createComponent(ProductImageComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('src', src);
    fixture.componentRef.setInput('alt', alt);
    fixture.detectChanges();
  }

  // 觸發圖片載入失敗並更新畫面。
  function failImage(): void {
    element.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
  }

  it('shows the product image with accessible text', () => {
    render('/images/products/sb-ang1.png');

    const image = element.querySelector('img')!;
    expect(image.getAttribute('src')).toBe('/images/products/sb-ang1.png');
    expect(image.getAttribute('alt')).toBe('Angular board');
  });

  it('replaces a failed image with readable text', () => {
    render('/images/products/missing.png');
    failImage();

    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('圖片暫無法顯示');
  });

  it('resets the failure state when the product image changes', () => {
    render('/images/products/missing.png');
    failImage();

    fixture.componentRef.setInput('src', '/images/products/sb-ang1.png');
    fixture.detectChanges();

    expect(element.querySelector('img')!.getAttribute('src')).toBe(
      '/images/products/sb-ang1.png',
    );
    expect(element.textContent).not.toContain('圖片暫無法顯示');
  });
});
