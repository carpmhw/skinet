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
  console.error('找不到 dist/client/index.html，請先執行 ng build --configuration production。');
  process.exit(1);
}

const root = mkdtempSync(join(tmpdir(), 'skinet-e2e-'));
const webroot = join(root, 'wwwroot');
cpSync(dist, webroot, { recursive: true });
cpSync(join(api, 'wwwroot', 'images'), join(webroot, 'images'), { recursive: true });

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

let cleaned = false;

// 只清除一次暫存目錄，避免多個結束訊號重複刪除。
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(root, { recursive: true, force: true });
}

// 收到中斷或終止訊號時先停止 API，待其結束後再清除並退出。
function stop(signal) {
  if (server.exitCode === null) server.kill(signal);
  else process.exit(0);
}

server.on('exit', code => {
  cleanup();
  process.exit(code ?? 0);
});
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('exit', cleanup);
