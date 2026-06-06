import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { normalizeThemeBulkBody, mergeBulkResponseShape } from '../../lib/normalizeBulkBody.ts';
import type { BridgeRestResult, ThemeBulkRow, WpProxyCtx } from '../../lib/types.ts';

function httpsZip(raw: unknown): string {
  const z = String(raw || '').trim();
  return z.startsWith('https://') ? z : '';
}

async function runOneThemeUpdate(
  ctx: WpProxyCtx,
  siteId: string,
  item: ThemeBulkRow,
  topLevelBody: Record<string, unknown>,
): Promise<BridgeRestResult> {
  const stylesheet = String(item.stylesheet || item.slug || '').trim();
  const slug = String(item.slug || stylesheet || '').trim();
  const version = String(item.version || '').trim();
  const zipDirect =
    httpsZip(item.zip_url) ||
    httpsZip(item.zipUrl) ||
    httpsZip(topLevelBody.zip_url) ||
    httpsZip(topLevelBody.zipUrl);

  const row: ThemeBulkRow = { stylesheet, slug, version };
  if (zipDirect) {
    row.zip_url = zipDirect;
    return callBridgeRest(ctx, {
      siteId,
      bridgePath: 'wphubpro/v1/themes/manage/update',
      method: 'POST',
      body: { themes: [row] },
    });
  }

  const libraryItemId = String(
    item.libraryItemId ||
      item.library_item_id ||
      topLevelBody.libraryItemId ||
      topLevelBody.library_item_id ||
      '',
  ).trim();
  const routeSlug = String(
    item.routeSlug || item.route_slug || topLevelBody.routeSlug || topLevelBody.route_slug || '',
  ).trim();
  const libVersion = String(item.version || topLevelBody.version || '').trim();

  if (libraryItemId) {
    const resolved = await getResourceItem.resolveThemeLibraryZip({
      databases: ctx.databases,
      log: ctx.log,
      libraryItemId,
      routeSlug,
      version: libVersion,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        statusCode: resolved.statusCode || 400,
        message: resolved.message || 'Zip resolve failed.',
      };
    }
    row.zip_url = resolved.zipUrl;
    return callBridgeRest(ctx, {
      siteId,
      bridgePath: 'wphubpro/v1/themes/manage/update',
      method: 'POST',
      body: { themes: [row] },
    });
  }

  return callBridgeRest(ctx, {
    siteId,
    bridgePath: 'wphubpro/v1/themes/manage/update',
    method: 'POST',
    body: { themes: [row] },
  });
}

function normalizeOneThemeUpdateResponse(responseData: unknown, themeId: string) {
  const shape = mergeBulkResponseShape(responseData);
  if (shape) return shape;
  return { results: [{ id: themeId, ok: true }], succeeded: 1, failed: 0 };
}

export default async function handleThemesUpdate(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const norm = normalizeThemeBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);

  const themes = norm.body.themes;
  const siteIdStr = String(siteId);
  if (themes.length === 1) {
    const r = await runOneThemeUpdate(ctx, siteIdStr, themes[0], rawBody);
    if (!r.ok) return fail(res, r.message, r.statusCode || 500, r.details);
    const tid = String(themes[0].stylesheet || themes[0].slug || '').trim();
    return ok(res, normalizeOneThemeUpdateResponse(r.responseData, tid));
  }

  const merged = { results: [] as { id: string; ok: boolean; error?: string }[], succeeded: 0, failed: 0 };
  for (const item of themes) {
    const tid = String(item.stylesheet || item.slug || '').trim();
    const r = await runOneThemeUpdate(ctx, siteIdStr, item, rawBody);
    if (!r.ok) {
      merged.results.push({ id: tid, ok: false, error: r.message || 'Update failed.' });
      merged.failed += 1;
      continue;
    }
    const one = normalizeOneThemeUpdateResponse(r.responseData, tid);
    merged.results.push(...one.results);
    merged.succeeded += one.succeeded;
    merged.failed += one.failed;
  }
  return ok(res, merged);
}
