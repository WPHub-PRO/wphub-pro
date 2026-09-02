import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../lib/connectBridge.ts';
import type { WpProxyCtx } from '../lib/types.ts';

/**
 * Hub → bridge: POST hub/invoke with handler `sync`.
 * Bridge collects plugins/themes/wp_meta + Site Health and posts sync_site_meta.
 */
export default async function handleSync(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);

  const result = await callBridgeRest(ctx, {
    siteId: String(siteId),
    bridgePath: 'wphubpro/v1/hub/invoke',
    method: 'POST',
    body: { handler: 'sync', args: {} },
  });
  if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
  return ok(res, result.responseData);
}
