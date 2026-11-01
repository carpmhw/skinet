import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppComponent } from './app.component';
import { AppModule } from './app.module';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      // Match the zone-based change detection configured in main.ts.
      providers: [
        provideZoneChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('renders the SkiNet shell with a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.wordmark')?.textContent).toContain('SkiNet');
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
    expect(compiled.querySelector('main#main-content')).not.toBeNull();
    expect(compiled.querySelector('footer')?.textContent).toContain('價格以新臺幣 TWD 顯示');
  });

  it('does not show placeholder cart or account controls', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.textContent).not.toContain('Login');
    expect(compiled.textContent).not.toContain('Sign up');
    expect(compiled.querySelector('.cart-no')).toBeNull();
  });

  it('moves focus to the main content when the route path changes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/missing');
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('#main-content'),
    );
  });
});
