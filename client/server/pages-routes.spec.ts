import { afterEach, expect, it, vi } from 'vitest';
import { onRequest as apiRoot } from '../functions/api/index';
import { onRequest as apiPath } from '../functions/api/[[path]]';
import { onRequest as imageRoot } from '../functions/images/index';
import { onRequest as imagePath } from '../functions/images/[[path]]';

const env = {
  API_ORIGIN: 'https://api.example.com',
  CF_ACCESS_CLIENT_ID: 'server-id',
  CF_ACCESS_CLIENT_SECRET: 'server-secret'
};

// 每個案例後清除外部服務替身，避免影響其他入口。
afterEach(() => vi.unstubAllGlobals());

it.each([
  [apiRoot, '/api'], [apiPath, '/api/buggy/servererror'],
  [imageRoot, '/images'], [imagePath, '/images/private.png']
] as const)('keeps reserved route out of SPA: %#', async (entry, path) => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  const response = await entry({ request: new Request(`https://shop.example${path}`), env });
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Not found' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  [apiRoot, '/api/products', 'application/json', '{"data":[]}'],
  [apiPath, '/api/products/17', 'application/json', '{"id":17}'],
  [imageRoot, '/images/products/a.png', 'image/png', 'image-bytes'],
  [imagePath, '/images/products/a.png', 'image/png', 'image-bytes']
] as const)('delegates approved requests without leaking secrets: %#', async (entry, path, type, body) => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const upstream = input as Request;
    expect(upstream.url).toBe(`https://api.example.com${path}`);
    expect(upstream.headers.get('CF-Access-Client-Secret')).toBe('server-secret');
    expect(upstream.headers.get('Cookie')).toBeNull();
    return new Response(body, { headers: { 'Content-Type': type, 'Set-Cookie': 'server-secret' } });
  }));
  const response = await entry({ request: new Request(`https://shop.example${path}`, {
    headers: { Cookie: 'visitor=1', 'CF-Access-Client-Secret': 'forged' }
  }), env });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(body);
  expect(Object.fromEntries(response.headers)).toEqual({
    'cache-control': 'no-store', 'content-type': type
  });
});
