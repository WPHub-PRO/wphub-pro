import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import { normalizeThemeBulkBody } from '../../lib/normalizeBulkBody.ts';
import type { WpProxyCtx } from '../../lib/types.ts';

export default async function handleThemesDelete(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? payload.body : {};
  const norm = normalizeThemeBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);
  const result = await callBridgeRest(ctx, {
    siteId: String(siteId),
    bridgePath: 'wphubpro/v1/themes/manage/delete',
    method: 'POST',
    body: norm.body,
  });
  if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
  return ok(res, result.responseData);
}
