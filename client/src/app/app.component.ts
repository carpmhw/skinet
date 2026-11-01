import { Component, inject, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  private readonly router = inject(Router);
  private lastPath = '';
  private readonly navigationSub: Subscription;

  constructor() {
    this.navigationSub = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.focusOnPathChange(event.urlAfterRedirects));
  }

  // 釋放路由事件訂閱。
  ngOnDestroy(): void {
    this.navigationSub.unsubscribe();
  }

  // 只在路徑變更時把焦點移到主內容；query 變更保留目前操作位置。
  private focusOnPathChange(url: string): void {
    const path = url.split('?')[0];
    if (path === this.lastPath) {
      return;
    }
    this.lastPath = path;
    setTimeout(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
  }
}
