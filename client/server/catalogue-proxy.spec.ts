import { expect, it, vi } from 'vitest';
import { proxyCatalogue, type ProxyEnv } from './catalogue-proxy';

const env: ProxyEnv = {
  API_ORIGIN: 'https://api.example.com/',
  CF_ACCESS_CLIENT_ID: 'private-id',
  CF_ACCESS_CLIENT_SECRET: 'private-secret'
};

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
