import { proxyCatalogue, type ProxyEnv } from '../../server/catalogue-proxy';

/** 將 API 子路徑交由同一個憑證與白名單邊界處理。 */
export function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return proxyCatalogue(context.request, context.env);
}
