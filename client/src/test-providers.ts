import { EnvironmentProviders, Provider, provideZoneChangeDetection } from '@angular/core';

// 測試環境統一啟用 Zone 變更偵測，與 main.ts 的設定保持一致。
const testProviders: (Provider | EnvironmentProviders)[] = [provideZoneChangeDetection()];

export default testProviders;
