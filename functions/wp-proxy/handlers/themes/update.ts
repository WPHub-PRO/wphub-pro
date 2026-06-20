import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { attachZipSource } from '../../lib/pluginZipSource.ts';
import {
  mergeBulkResponseShape,
  mergeBulkResponses,
  normalizeThemeBulkBody,
} from '../../lib/normalizeBulkBody.ts';
import type { BulkOperationResult, BulkResponseShape, ThemeBulkRow, WpProxyCtx } from '../../lib/types.ts';

function httpsZip(raw: unknown): string {
  const z = String(raw || '').trim();
  return z.startsWith('https://') ? z : '';
}

type ResolvedThemeUpdate =
  | { ok: true; row: ThemeBulkRow; id: string }
  | { ok: false; id: string; error: string };

async function resolveOneThemeUpdate(
  ctx: WpProxyCtx,
  item: ThemeBulkRow,
  topLevelBody: Record<string, unknown>,
): Promise<ResolvedThemeUpdate> {
  const stylesheet = String(item.stylesheet || item.slug || '').trim();
  const slug = String(item.slug || stylesheet || '').trim();
  const version = String(item.version || '').trim();
  const id = stylesheet || slug || 'theme';
  const zipDirect =
    httpsZip(item.zip_url) ||
    httpsZip(item.zipUrl) ||
    httpsZip(topLevelBody.zip_url) ||
    httpsZip(topLevelBody.zipUrl);

  const row: ThemeBulkRow = { stylesheet, slug, version };
  if (zipDirect) {
    row.zip_url = zipDirect;
    attachZipSource(row, item.source ?? topLevelBody.source);
    return { ok: true, row, id };
  }

  const libId = String(
    item.libraryItemId ||
      item.library_item_id ||
      topLevelBody.libraryItemId ||
      topLevelBody.library_item_id ||
      '',
  ).trim();
  const libVersion = String(item.version || topLevelBody.version || '').trim();
  const routeSlug = String(
    item.routeSlug || item.route_slug || topLevelBody.routeSlug || topLevelBody.route_slug || '',
  ).trim();

  if (libId) {
    const resolved = await getResourceItem.resolveThemeUpdateZipUrl({
      databases: ctx.databases,
      fetchImpl: ctx.fetch,
      log: ctx.log,
      body: {
        stylesheet,
        slug,
        libraryItemId: libId,
        library_item_id: libId,
        version: libVersion,
        source: item.source || topLevelBody.source,
        routeSlug,
        route_slug: routeSlug,
      },
    });
    if (!resolved.ok) {
      return {
        ok: false,
        id,
        error: resolved.message || 'Zip resolve failed.',
      };
    }
    row.zip_url = resolved.zipUrl;
    row.version = libVersion || version;
    attachZipSource(row, resolved.source, item.source ?? topLevelBody.source);
    return { ok: true, row, id };
  }

  if (slug && version) {
    const resolved = await getResourceItem.resolveThemeUpdateZipUrl({
      databases: ctx.databases,
      fetchImpl: ctx.fetch,
      log: ctx.log,
      body: {
        stylesheet,
        slug,
        version,
        source: item.source || topLevelBody.source,
      },
    });
    if (!resolved.ok) {
      return {
        ok: false,
        id,
        error: resolved.message || 'Zip resolve failed.',
      };
    }
    row.zip_url = resolved.zipUrl;
    attachZipSource(row, resolved.source, item.source ?? topLevelBody.source);
    return { ok: true, row, id };
  }

  if (stylesheet || slug) {
    return { ok: true, row: { stylesheet, slug, version: version || '' }, id };
  }

  const resolved = await getResourceItem.resolveThemeUpdateZipUrl({
    databases: ctx.databases,
    fetchImpl: ctx.fetch,
    log: ctx.log,
    body: { ...topLevelBody, stylesheet, slug: slug || undefined },
  });
  if (!resolved.ok) {
    return {
      ok: false,
      id,
      error: resolved.message || 'Zip resolve failed.',
    };
  }
  row.zip_url = resolved.zipUrl;
  row.version = String(topLevelBody.version || version || '').trim();
  attachZipSource(row, resolved.source, topLevelBody.source);
  return { ok: true, row, id };
}

export default async function handleThemesUpdate(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const norm = normalizeThemeBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);

  const siteIdStr = String(siteId);
  const resolvedRows: ThemeBulkRow[] = [];
  const preErrors: BulkOperationResult[] = [];

  for (const item of norm.body.themes) {
    const resolved = await resolveOneThemeUpdate(ctx, item, rawBody);
    if (!resolved.ok) {
      preErrors.push({ id: resolved.id, ok: false, error: resolved.error });
      continue;
    }
    resolvedRows.push(resolved.row);
  }

  if (resolvedRows.length === 0) {
    return ok(res, { results: preErrors, succeeded: 0, failed: preErrors.length });
  }

  const result = await callBridgeRest(ctx, {
    siteId: siteIdStr,
    bridgePath: 'wphubpro/v1/themes/manage/update',
    method: 'POST',
    body: { themes: resolvedRows },
  });

  if (!result.ok) {
    const failedRows: BulkOperationResult[] = resolvedRows.map((row, i) => ({
      id: String(row.stylesheet || row.slug || `theme-${i}`),
      ok: false,
      error: result.message || 'Update failed.',
    }));
    return ok(res, {
      results: [...preErrors, ...failedRows],
      succeeded: 0,
      failed: preErrors.length + failedRows.length,
    });
  }

  const shape: BulkResponseShape | null = mergeBulkResponseShape(result.responseData);
  return ok(res, mergeBulkResponses(preErrors, shape));
}
