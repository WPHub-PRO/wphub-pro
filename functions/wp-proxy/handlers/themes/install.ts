import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import type { WpProxyCtx } from '../../lib/types.ts';

export default async function handleThemesInstall(ctx: WpProxyCtx) {
  const { res, payload, databases } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const body = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const plugin = String(body.plugin || '').trim();

  const zipDirect = String(body.zip_url || body.zipUrl || '').trim();
  if (zipDirect.startsWith('https://')) {
    const result = await callBridgeRest(ctx, {
      siteId: String(siteId),
      bridgePath: 'wphubpro/v1/themes/manage/install-from-zip',
      method: 'POST',
      body: { zip_url: zipDirect, plugin },
    });
    if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
    return ok(res, result.responseData);
  }

  const libraryItemId = String(body.libraryItemId || body.library_item_id || '').trim();
  const routeSlug = String(body.routeSlug || body.route_slug || '').trim();
  if (!libraryItemId) {
    return fail(res, 'body.zip_url or body.libraryItemId is required for theme install.', 400);
  }

  const resolved = await getResourceItem.resolveThemeLibraryZip({
    databases,
    log: ctx.log,
    libraryItemId,
    routeSlug,
    version: '',
  });
  if (!resolved.ok) return fail(res, resolved.message, resolved.statusCode);

  const result = await callBridgeRest(ctx, {
    siteId: String(siteId),
    bridgePath: 'wphubpro/v1/themes/manage/install-from-zip',
    method: 'POST',
    body: { zip_url: resolved.zipUrl, plugin },
  });
  if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
  return ok(res, result.responseData);
}
