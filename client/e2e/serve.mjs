// 瀏覽器測試專用：以暫存 webroot 與暫存 SQLite 啟動實際 API，結束時清除，不寫入 repo。
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = resolve(client, '..', 'API');
const dist = join(client, 'dist', 'client');
const port = process.env.E2E_PORT ?? '5199';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('找不到 dist/client/index.html；請透過 npx playwright test 或 npm run e2e:browser 執行，會先自動建置。');
  process.exit(1);
}

const root = mkdtempSync(join(tmpdir(), 'skinet-e2e-'));
let cleaned = false;

// 只清除一次暫存目錄，避免多個結束訊號重複刪除。
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(root, { recursive: true, force: true });
}

// 暫存目錄一建立就註冊清除，之後任何同步錯誤或正常結束都會清掉。
process.on('exit', cleanup);

const webroot = join(root, 'wwwroot');
try {
  cpSync(dist, webroot, { recursive: true });
  cpSync(join(api, 'wwwroot', 'images'), join(webroot, 'images'), { recursive: true });
} catch (error) {
  console.error('準備暫存 webroot 失敗：', error);
  process.exit(1);
}

const server = spawn('dotnet', ['run', '--no-launch-profile', '--', '--webroot', webroot], {
  cwd: api,
  stdio: 'inherit',
  env: {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: 'Production',
    ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
    ConnectionStrings__DefaultConnection: `Data Source=${join(root, 'e2e.db')}`,
  },
});

// 收到中斷、終止或終端機關閉訊號時先停止 API，待其結束後再清除並退出。
function stop() {
  if (server.exitCode === null) server.kill('SIGTERM');
  else process.exit(0);
}

server.on('exit', code => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, stop);
}
