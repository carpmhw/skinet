import { proxyCatalogue, type ProxyEnv } from '../../server/catalogue-proxy';

/** 將 API 根節點交由白名單代理判斷，禁止落入 SPA。 */
export function onRequest(context: { request: Request; env: ProxyEnv }): Promise<Response> {
  return proxyCatalogue(context.request, context.env);
}
