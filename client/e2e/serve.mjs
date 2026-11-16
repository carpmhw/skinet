// 瀏覽器測試專用：以暫存 webroot 與暫存 SQLite 啟動實際 API，結束時清除，不寫入 repo。
import { spawn } from 'node:child_process';
import { cpSync, existsSync, fstatSync, mkdtempSync, rmSync } from 'node:fs';
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
  // API 不讀 stdin，改接 /dev/null，避免持有 Playwright 的管道。
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: 'Production',
    ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
    ConnectionStrings__DefaultConnection: `Data Source=${join(root, 'e2e.db')}`,
  },
});

// 收到中斷、終止或終端機關閉訊號時先停止 API，待其結束後再清除並退出。
let stopping = false;

function stop() {
  stopping = true;
  if (server.exitCode === null) server.kill('SIGTERM');
  else process.exit(0);
}

server.on('exit', code => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, stop);
}

// Playwright 讓 webServer 在獨立 session 執行，關閉終端機時這裡收不到 SIGHUP；
// 但 Playwright 結束時會關閉給我們的 stdin 管道，以此作為停止訊號。
// 只在 stdin 是管道或 socket 時啟用，從終端機或 /dev/null 執行時不受影響。
const stdin = fstatSync(0);
if (stdin.isFIFO() || stdin.isSocket()) {
  // 只有在尚未因訊號停止時才記錄原因：正常 teardown 會先收到 SIGTERM 再關閉管道，不必多印；
  // 管道一開始就關閉或啟動者異常結束時則留下一行說明，避免無聲退出難以排查。
  const stopOnClosedInput = () => {
    if (!stopping) console.error('serve.mjs：stdin 已關閉（啟動者已結束），停止 API。');
    stop();
  };
  process.stdin.on('end', stopOnClosedInput);
  process.stdin.on('error', stopOnClosedInput);
  process.stdin.resume();
}
