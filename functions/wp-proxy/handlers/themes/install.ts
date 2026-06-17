import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { attachZipSource } from '../../lib/pluginZipSource.ts';
import type { WpProxyCtx } from '../../lib/types.ts';

export default async function handleThemesInstall(ctx: WpProxyCtx) {
  const { res, payload, databases } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const body = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};

  const plugin = String(body.plugin || '').trim();
  let libraryItemId = String(body.libraryItemId || body.library_item_id || '').trim();
  const routeSlug = String(body.routeSlug || body.route_slug || '').trim();
  let version = String(body.version || '').trim();

  const COMPOSITE_SEP = '::';
  const compIdx = libraryItemId.indexOf(COMPOSITE_SEP);
  if (compIdx > 0) {
    try {
      const idPart = libraryItemId.slice(0, compIdx);
      const encPart = libraryItemId.slice(compIdx + COMPOSITE_SEP.length);
      libraryItemId = idPart.trim();
      if (!version) version = decodeURIComponent(encPart).trim();
    } catch {
      /* keep libraryItemId */
    }
  }

  const zipDirect = String(body.zip_url || body.zipUrl || '').trim();
  if (zipDirect.startsWith('https://')) {
    const result = await callBridgeRest(ctx, {
      siteId: String(siteId),
      bridgePath: 'wphubpro/v1/themes/manage/install',
      method: 'POST',
      body: attachZipSource({ zip_url: zipDirect, plugin }, body.source),
    });
    if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
    return ok(res, result.responseData);
  }

  if (libraryItemId && version) {
    const official = await getResourceItem.resolveThemeLibraryInstallVersion({
      databases,
      libraryItemId,
      routeSlug,
      log: ctx.log,
    });
    if (official.ok) {
      const result = await callBridgeRest(ctx, {
        siteId: String(siteId),
        bridgePath: 'wphubpro/v1/themes/manage/install',
        method: 'POST',
        body: { slug: official.slug, version: official.version },
      });
      if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
      return ok(res, result.responseData);
    }

    const zipRes = await getResourceItem.resolveThemeUpdateZipUrl({
      databases,
      fetchImpl: ctx.fetch,
      log: ctx.log,
      body: {
        libraryItemId,
        library_item_id: libraryItemId,
        version,
        source: String(body.source || '').trim().toLowerCase(),
        routeSlug,
        route_slug: routeSlug,
      },
    });
    if (!zipRes.ok) {
      return fail(
        res,
        zipRes.message || official.message || 'Could not resolve a ZIP for this library theme version.',
        zipRes.statusCode || official.statusCode || 400,
      );
    }
    const result = await callBridgeRest(ctx, {
      siteId: String(siteId),
      bridgePath: 'wphubpro/v1/themes/manage/install',
      method: 'POST',
      body: attachZipSource({ zip_url: zipRes.zipUrl, plugin }, zipRes.source, body.source),
    });
    if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
    return ok(res, result.responseData);
  }

  if (libraryItemId && !version) {
    return fail(
      res,
      'body.version is required with libraryItemId for library theme ZIP installs (local / remote / non–install-version rows).',
      400,
    );
  }

  const slug = String(body.slug || body.stylesheet || '').trim().toLowerCase();
  if (!slug || !version) {
    return fail(
      res,
      'Provide body.zip_url, or body.slug + body.version, or body.libraryItemId + body.version for library installs.',
      400,
    );
  }
  const result = await callBridgeRest(ctx, {
    siteId: String(siteId),
    bridgePath: 'wphubpro/v1/themes/manage/install',
    method: 'POST',
    body: { slug, version },
  });
  if (!result.ok) return fail(res, result.message, result.statusCode, result.details);
  return ok(res, result.responseData);
}
