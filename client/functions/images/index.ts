import { proxyCatalogue, type ProxyEnv } from '../../server/catalogue-proxy';

/** 攔截圖片根節點，避免不存在的圖片回傳 SPA。 */
export function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return proxyCatalogue(context.request, context.env);
}
