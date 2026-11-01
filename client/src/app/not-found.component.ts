import { Component, inject, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';

@Component({
  selector: 'app-not-found',
  standalone: false,
  template: `
    <section class="not-found">
      <h1>找不到頁面</h1>
      <p>這個網址沒有對應的頁面，可能已經移除或輸入有誤。</p>
      <a routerLink="/shop">返回商品目錄</a>
    </section>
  `,
  styles: [
    `
      .not-found {
        max-width: 720px;
        margin: 0 auto;
        padding: 64px 24px;
      }

      .not-found h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }

      .not-found p {
        margin: 0 0 24px;
        color: #545b63;
      }

      .not-found a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: #141414;
        text-underline-offset: 5px;
      }
    `,
  ],
})
export class NotFoundComponent implements OnInit {
  private readonly title = inject(Title);

  // 讓瀏覽器分頁標題反映目前的不存在頁面。
  ngOnInit(): void {
    this.title.setTitle('找不到頁面 | SkiNet');
  }
}
