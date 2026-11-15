import { defineConfig } from '@playwright/test';

const port = process.env['E2E_PORT'] ?? '5199';
const baseURL = `http://127.0.0.1:${port}`;

// 以實際 API 同源提供正式建置，桌面與 375px 兩種寬度只跑 Chromium。
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL, browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: false } },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: `${baseURL}/api/products/brands`,
    reuseExistingServer: false,
    timeout: 180_000,
    // 預設 SIGKILL 會跳過 serve.mjs 的暫存目錄清除。
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
