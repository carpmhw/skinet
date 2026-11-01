import { Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-product-image',
  standalone: false,
  template: `
    @if (failed) {
      <span
        class="image-fallback"
        role="img"
        [attr.aria-label]="alt + '，圖片暫無法顯示'"
      >圖片暫無法顯示</span>
    } @else {
      <img [src]="src" [alt]="alt" width="400" height="400" (error)="failed = true" />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }

      img {
        width: 86%;
        height: 86%;
        object-fit: contain;
      }

      .image-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 16px;
        color: #545b63;
        font-size: 14px;
        text-align: center;
      }
    `,
  ],
})
export class ProductImageComponent implements OnChanges {
  @Input({ required: true }) src = '';
  @Input({ required: true }) alt = '';
  failed = false;

  // 換圖時重設失敗狀態，避免上一張圖的錯誤殘留。
  ngOnChanges(): void {
    this.failed = false;
  }
}
