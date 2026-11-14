export interface ProxyEnv {
  API_ORIGIN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

/** 僅代理公開商品與圖片；服務憑證只送往受控的 HTTPS origin。 */
export async function proxyCatalogue(
  request: Request, env: ProxyEnv, fetcher: typeof fetch = fetch
): Promise<Response> {
  const head = request.method === 'HEAD';
  /** 產生固定錯誤，避免將上游登入頁或內部資訊交給訪客。 */
  const failure = (status: number, message: string) => new Response(
    head ? null : JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET, HEAD' } : {})
      }
    }
  );
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  const api = /^\/api\/products(?:\/(?:brands|types|[1-9][0-9]*))?$/.test(path);
  const image = /^\/images\/products\/[a-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif|avif)$/i.test(path);
  if (!api && !image) return failure(404, 'Not found');
  if (request.method !== 'GET' && !head) return failure(405, 'Method not allowed');

  const origin = env.API_ORIGIN ? URL.parse(env.API_ORIGIN) : null;
  if (!origin || origin.protocol !== 'https:' || origin.username || origin.password ||
    origin.pathname !== '/' || origin.search || origin.hash ||
    !env.CF_ACCESS_CLIENT_ID?.trim() || !env.CF_ACCESS_CLIENT_SECRET?.trim()) {
    return failure(503, 'Proxy is not configured');
  }
  let headers: Headers;
  // 標頭建構是設定值邊界；錯誤訊息可能含憑證，不得向外拋出或記錄。
  try {
    headers = new Headers({
      'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID,
      'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET
    });
  } catch {
    return failure(503, 'Proxy is not configured');
  }
  const accept = request.headers.get('Accept');
  if (accept) headers.set('Accept', accept);
  const target = new URL(origin.origin);
  target.pathname = path;
  target.search = url.search;
  let upstream: Response;
  try {
    upstream = await fetcher(new Request(target, { method: 'GET', headers, redirect: 'manual' }));
  } catch {
    // 不記錄原始例外；其訊息可能包含網址、標頭或憑證。
    console.warn('catalogue_proxy', { reason: 'fetch_failed' });
    return failure(502, 'Backend unavailable');
  }
  const contentType = upstream.headers.get('Content-Type') ?? '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  const rejected = (upstream.status >= 300 && upstream.status < 400) ||
    upstream.status === 401 || upstream.status === 403;
  const jsonType = /^application\/(?:json|[a-z0-9!#$&^_.+-]+\+json)$/.test(mime);
  const imageType = /^image\/[a-z0-9.+-]+$/.test(mime);
  const expectedType = api ? jsonType : imageType;
  if (rejected || !expectedType || (image && !upstream.ok)) {
    if (!(image && upstream.status === 404)) {
      const reason = upstream.status >= 300 && upstream.status < 400 ? 'upstream_redirect'
        : upstream.status === 401 || upstream.status === 403 ? 'upstream_auth'
        : !expectedType ? 'unexpected_content_type' : 'upstream_status';
      // 僅輸出固定分類與狀態碼，不輸出原始 MIME、網址、標頭或回應內容。
      console.warn('catalogue_proxy', {
        reason,
        status: upstream.status,
        contentType: jsonType ? 'json' : imageType ? 'image'
          : mime === 'text/html' ? 'html' : !mime ? 'missing' : 'other'
      });
    }
    await upstream.body?.cancel();
    return image && upstream.status === 404
      ? failure(404, 'Not found') : failure(502, 'Backend unavailable');
  }
  if (head) await upstream.body?.cancel();
  return new Response(head ? null : upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' }
  });
}
