import { proxyCatalogue, type ProxyEnv } from '../../server/catalogue-proxy';

/** 僅透過共用代理取得允許的商品圖片。 */
export function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return proxyCatalogue(context.request, context.env);
}
