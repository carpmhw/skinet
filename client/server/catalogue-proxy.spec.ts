import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { proxyCatalogue, type ProxyEnv } from './catalogue-proxy';

const env: ProxyEnv = {
  API_ORIGIN: 'https://api.example.com/',
  CF_ACCESS_CLIENT_ID: 'private-id',
  CF_ACCESS_CLIENT_SECRET: 'private-secret'
};

// 攔截實際日誌輸出邊界，檢查診斷欄位並避免測試錯誤污染終端。
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// 每個案例還原日誌，避免替身跨測試殘留。
afterEach(() => vi.restoreAllMocks());

/** 建立真實瀏覽器請求，保留可控制的路徑與方法。 */
function request(path = '/api/products', method = 'GET') {
  return new Request(`https://shop.example.com${path}`, { method });
}

/** 驗證代理錯誤不攜帶上游或認證資訊。 */
async function error(response: Response, status: number, message: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: message });
  expect([...response.headers.keys()].sort()).toEqual(
    status === 405 ? ['allow', 'cache-control', 'content-type'] : ['cache-control', 'content-type']
  );
}

// 若遺失固定 origin、query 或標頭隔離，這個邊界案例會失敗。
it('preserves query while replacing visitor credentials with runtime secrets', async () => {
  const query = '?search=green&pageIndex=2&brandId=1&sort=priceAsc&url=https://evil.example';
  const visitor = new Request(`https://shop.example.com/api/products${query}`, {
    headers: {
      Accept: 'application/json', Cookie: 'visitor=1', Authorization: 'Bearer visitor',
      Host: 'evil.example', 'CF-Access-Client-Id': 'forged', 'CF-Access-Client-Secret': 'forged'
    }
  });
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const upstream = input as Request;
    expect(upstream.url).toBe(`https://api.example.com/api/products${query}`);
    expect(upstream.method).toBe('GET');
    expect(upstream.redirect).toBe('manual');
    expect(Object.fromEntries(upstream.headers)).toEqual({
      accept: 'application/json', 'cf-access-client-id': 'private-id',
      'cf-access-client-secret': 'private-secret'
    });
    return new Response('{"data":[{"id":1}]}', {
      headers: {
        'Content-Type': 'application/json', 'Set-Cookie': 'secret=1',
        'Content-Length': '100', 'Content-Encoding': 'gzip', 'CF-Access-Client-Secret': 'private-secret'
      }
    });
  });
  const response = await proxyCatalogue(visitor, env, fetcher);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [{ id: 1 }] });
  expect(Object.fromEntries(response.headers)).toEqual({
    'cache-control': 'no-store', 'content-type': 'application/json'
  });
});

it.each(['/api/products', '/api/products/17', '/api/products/brands', '/api/products/types', '/api/products/'])(
  'allows catalogue route %s', async (path) => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      expect((input as Request).url).toBe(`https://api.example.com${path.replace(/\/$/, '')}`);
      return Response.json({ id: 17 });
    });
    expect((await proxyCatalogue(request(path), env, fetcher)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
  }
);

it.each([
  '/api', '/api/unknown', '/api/buggy/servererror', '/api/products/0', '/api/products/-1',
  '/api/products/01', '/images', '/images/products/sub/a.png', '/images/products/a.svg',
  '/images/products/a%2f.png', '/images/products/a%5cb.png', '/api/%70roducts',
  '/images/products/../private.png', '/api/products//'
])('rejects unapproved route %s without fetching', async (path) => {
  const fetcher = vi.fn<typeof fetch>();
  await error(await proxyCatalogue(request(path), env, fetcher), 404, 'Not found');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['POST', 'OPTIONS', 'DELETE'])('rejects %s on approved paths', async (method) => {
  const fetcher = vi.fn<typeof fetch>();
  const response = await proxyCatalogue(request('/api/products', method), env, fetcher);
  expect(response.headers.get('allow')).toBe('GET, HEAD');
  await error(response, 405, 'Method not allowed');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  {}, { ...env, API_ORIGIN: undefined }, { ...env, CF_ACCESS_CLIENT_ID: undefined },
  { ...env, CF_ACCESS_CLIENT_SECRET: undefined }, { ...env, CF_ACCESS_CLIENT_ID: ' ' },
  { ...env, CF_ACCESS_CLIENT_SECRET: '' },
  ...['http://api.example.com', 'https://u:p@api.example.com', 'https://api.example.com/path',
    'https://api.example.com?x=1', 'https://api.example.com#x', 'invalid']
    .map(API_ORIGIN => ({ ...env, API_ORIGIN }))
])('fails closed for invalid runtime configuration %#', async (bindings) => {
  const fetcher = vi.fn<typeof fetch>();
  await error(await proxyCatalogue(request(), bindings, fetcher), 503, 'Proxy is not configured');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([301, 302, 303, 307, 308, 401, 403])('hides upstream authentication or redirect %s', async (status) => {
  const upstream = new Response('private-secret', {
    status, headers: { Location: 'https://login.example', 'Set-Cookie': 'private-secret' }
  });
  const fetcher = vi.fn<typeof fetch>(async () => upstream);
  await error(await proxyCatalogue(request(), env, fetcher), 502, 'Backend unavailable');
  expect(upstream.bodyUsed).toBe(true);
});

it.each([200, 400, 500])('does not expose HTML with upstream status %s', async (status) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('<html>login</html>', {
    status, headers: { 'Content-Type': 'text/html' }
  }));
  await error(await proxyCatalogue(request(), env, fetcher), 502, 'Backend unavailable');
});

it('hides network exceptions', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('private-secret'); });
  await error(await proxyCatalogue(request(), env, fetcher), 502, 'Backend unavailable');
});

it.each(['private\nsecret', '中文憑證'])(
  'rejects non-header-safe credentials without leaking exceptions: %#', async (value) => {
    for (const binding of ['CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']) {
      const fetcher = vi.fn<typeof fetch>();
      await error(
        await proxyCatalogue(request(), { ...env, [binding]: value }, fetcher),
        503, 'Proxy is not configured'
      );
      expect(fetcher).not.toHaveBeenCalled();
    }
  }
);

it.each([400, 404, 500])('preserves ordinary JSON error %s', async (status) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{"status":1}', {
    status, headers: { 'Content-Type': 'application/problem+json; charset=utf-8' }
  }));
  const response = await proxyCatalogue(request(), env, fetcher);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ status: 1 });
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('streams image bytes with safe metadata', async () => {
  const bytes = new Uint8Array([0, 1, 128, 255]);
  const fetcher = vi.fn<typeof fetch>(async () => new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Set-Cookie': 'private-secret' }
  }));
  const response = await proxyCatalogue(request('/images/products/sb-ang1.png'), env, fetcher);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  expect(Object.fromEntries(response.headers)).toEqual({
    'cache-control': 'no-store', 'content-type': 'image/png'
  });
});

it.each([[200, 'text/html', 502, 'Backend unavailable'], [404, 'text/html', 404, 'Not found']] as const)(
  'handles image status %s without exposing HTML', async (status, contentType, expected, message) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('private-secret', {
      status, headers: { 'Content-Type': contentType }
    }));
    await error(await proxyCatalogue(request('/images/products/a.png'), env, fetcher), expected, message);
  }
);

it('implements HEAD via GET and cancels the unused stream', async () => {
  const upstream = Response.json({ data: [] });
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    expect((input as Request).method).toBe('GET');
    return upstream;
  });
  const response = await proxyCatalogue(request('/api/products', 'HEAD'), env, fetcher);
  expect(response.status).toBe(200);
  expect(response.body).toBeNull();
  expect(upstream.bodyUsed).toBe(true);
  expect(response.headers.get('content-type')).toBe('application/json');
});

it.each([
  ['/api', env, 404], ['/api/products', {}, 503]
])('suppresses HEAD error bodies for %s', async (path, bindings, status) => {
  const response = await proxyCatalogue(request(path as string, 'HEAD'), bindings as ProxyEnv);
  expect(response.status).toBe(status);
  expect(response.body).toBeNull();
  expect(response.headers.get('cache-control')).toBe('no-store');
});

// 缺少分類日誌或直接記錄上游資料，都會使診斷與保密斷言失敗。
it.each([
  [401, 'text/html; charset=utf-8', 'upstream_auth', 'html'],
  [403, 'application/json; secret=private-secret', 'upstream_auth', 'json'],
  [302, 'text/html', 'upstream_redirect', 'html'],
  [200, 'text/html', 'unexpected_content_type', 'html'],
  [502, 'text/plain', 'unexpected_content_type', 'other'],
  [200, '', 'unexpected_content_type', 'missing'],
  [200, 'private-secret/server-id', 'unexpected_content_type', 'other']
] as const)('logs sanitized upstream failure metadata: %#', async (status, type, reason, contentType) => {
  const upstream = new Response('private-secret', {
    status,
    headers: {
      'Content-Type': type, 'Set-Cookie': 'private-id',
      Location: 'https://login.example/private-secret'
    }
  });
  if (!type) upstream.headers.delete('Content-Type');
  const fetcher = vi.fn<typeof fetch>(async () => upstream);
  await error(
    await proxyCatalogue(request('/api/products?secret=private-secret'), env, fetcher),
    502, 'Backend unavailable'
  );
  expect(vi.mocked(console.warn).mock.calls).toEqual([
    ['catalogue_proxy', { reason, status, contentType }]
  ]);
});

// fetch 的原始例外可能包含憑證；日誌只可留下固定分類。
it('logs fetch failure without recording exception details', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => {
    throw new Error('private-id private-secret https://internal.example');
  });
  await error(await proxyCatalogue(request(), env, fetcher), 502, 'Backend unavailable');
  expect(vi.mocked(console.warn).mock.calls).toEqual([
    ['catalogue_proxy', { reason: 'fetch_failed' }]
  ]);
});

// HEAD 需保持無 body，診斷仍只在伺服器端輸出。
it('logs authentication failure for HEAD without exposing diagnostic fields', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('private-secret', {
    status: 403, headers: { 'Content-Type': 'text/html' }
  }));
  const response = await proxyCatalogue(request('/api/products', 'HEAD'), env, fetcher);
  expect(response.status).toBe(502);
  expect(response.body).toBeNull();
  expect(Object.fromEntries(response.headers)).toEqual({
    'cache-control': 'no-store', 'content-type': 'application/json'
  });
  expect(vi.mocked(console.warn).mock.calls).toEqual([
    ['catalogue_proxy', { reason: 'upstream_auth', status: 403, contentType: 'html' }]
  ]);
});

// 圖片錯誤狀態與內容錯誤分開，避免將有效 image MIME 當成成功。
it('classifies an upstream image error status', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('private-secret', {
    status: 500, headers: { 'Content-Type': 'image/png; secret=private-secret' }
  }));
  await error(
    await proxyCatalogue(request('/images/products/a.png'), env, fetcher),
    502, 'Backend unavailable'
  );
  expect(vi.mocked(console.warn).mock.calls).toEqual([
    ['catalogue_proxy', { reason: 'upstream_status', status: 500, contentType: 'image' }]
  ]);
});

// 正常回應與預期404不產生日誌，避免公開流量造成無謂的診斷噪音。
it.each([
  ['/api/products', 200, 'application/json'],
  ['/api/products', 404, 'application/problem+json'],
  ['/images/products/a.png', 200, 'image/png'],
  ['/images/products/a.png', 404, 'text/html']
] as const)('does not log ordinary responses: %#', async (path, status, contentType) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}', {
    status, headers: { 'Content-Type': contentType }
  }));
  const response = await proxyCatalogue(request(path), env, fetcher);
  expect(response.status).toBe(status);
  expect(console.warn).not.toHaveBeenCalled();
});
