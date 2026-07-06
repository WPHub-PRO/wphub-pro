import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { attachZipSource } from '../../lib/pluginZipSource.ts';
import {
  httpsZipUrl,
  mergeBulkResponseShape,
  normalizeThemeInstallBulkBody,
  parseCompositeLibraryItemId,
} from '../../lib/normalizeBulkBody.ts';
import type { BulkOperationResult, ThemeInstallBulkRow, WpProxyCtx } from '../../lib/types.ts';

function resolveThemeSlug(body: Record<string, unknown>, fallback?: string): string {
  return String(
    body.slug ||
      body.wpSlug ||
      body.wp_slug ||
      body.stylesheet ||
      body.routeSlug ||
      body.route_slug ||
      fallback ||
      '',
  )
    .trim()
    .toLowerCase();
}

function withThemeSlug<T extends Record<string, unknown>>(body: T, slug: string): T {
  if (!slug) return body;
  return { ...body, slug };
}

type ResolvedThemeInstall =
  | { ok: true; row: Record<string, unknown>; id: string }
  | { ok: false; id: string; error: string };

async function runOneThemeInstall(
  ctx: WpProxyCtx,
  item: ThemeInstallBulkRow,
  topLevelBody: Record<string, unknown>,
): Promise<ResolvedThemeInstall> {
  const { databases, log } = ctx;
  let libraryItemId = String(
    item.libraryItemId || item.library_item_id || topLevelBody.libraryItemId || topLevelBody.library_item_id || '',
  ).trim();
  const routeSlug = String(
    item.routeSlug || item.route_slug || topLevelBody.routeSlug || topLevelBody.route_slug || '',
  ).trim();
  let version = String(item.version || topLevelBody.version || '').trim();
  const slugHint = resolveThemeSlug(item as Record<string, unknown>, routeSlug);
  const id = slugHint || libraryItemId || 'theme';

  const parsed = parseCompositeLibraryItemId(libraryItemId, version);
  libraryItemId = parsed.libraryItemId;
  version = parsed.version;

  const zipDirect =
    httpsZipUrl(item.zip_url) ||
    httpsZipUrl(item.zipUrl) ||
    httpsZipUrl(topLevelBody.zip_url) ||
    httpsZipUrl(topLevelBody.zipUrl);

  if (zipDirect) {
    const row = attachZipSource(withThemeSlug({ zip_url: zipDirect }, slugHint), item.source ?? topLevelBody.source);
    return { ok: true, row, id: slugHint || id };
  }

  if (libraryItemId && version) {
    const sourceHint = String(item.source || topLevelBody.source || '')
      .trim()
      .toLowerCase();
    const preferExplicitZip =
      sourceHint === 'local' || sourceHint === 'remote';

    if (!preferExplicitZip) {
      const official = await getResourceItem.resolveThemeLibraryInstallVersion({
        databases,
        libraryItemId,
        routeSlug,
        log,
      });
      if (official.ok) {
        return {
          ok: true,
          row: { slug: official.slug, version: official.version },
          id: official.slug,
        };
      }
    }

    const zipRes = await getResourceItem.resolveThemeUpdateZipUrl({
      databases,
      fetchImpl: ctx.fetch,
      log,
      body: {
        libraryItemId,
        library_item_id: libraryItemId,
        version,
        source: String(item.source || topLevelBody.source || '').trim().toLowerCase(),
        routeSlug,
        route_slug: routeSlug,
      },
    });
    if (!zipRes.ok) {
      return {
        ok: false,
        id,
        error:
          zipRes.message || official.message || 'Could not resolve a ZIP for this library theme version.',
      };
    }
    const slug = resolveThemeSlug(item as Record<string, unknown>, zipRes.slug || routeSlug);
    const row = attachZipSource(withThemeSlug({ zip_url: zipRes.zipUrl }, slug), zipRes.source, item.source ?? topLevelBody.source);
    return { ok: true, row, id: slug || id };
  }

  if (libraryItemId && !version) {
    return {
      ok: false,
      id,
      error:
        'body.version is required with libraryItemId for library theme ZIP installs (local / remote / non–install-version rows).',
    };
  }

  const slug = slugHint;
  if (!slug || !version) {
    return {
      ok: false,
      id,
      error:
        'Provide zip_url, slug + version, or libraryItemId + version for each theme install row.',
    };
  }
  return { ok: true, row: { slug, version }, id: slug };
}

function unwrapBulkShape(responseData: unknown): ReturnType<typeof mergeBulkResponseShape> {
  const direct = mergeBulkResponseShape(responseData);
  if (direct) return direct;
  if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) return null;
  const nested = (responseData as Record<string, unknown>).data;
  return mergeBulkResponseShape(nested);
}

function normalizeInstallResponse(
  responseData: unknown,
  preErrors: BulkOperationResult[],
  resolvedCount: number,
) {
  const shape = unwrapBulkShape(responseData);
  if (shape) {
    return {
      results: [...preErrors, ...shape.results],
      succeeded: shape.succeeded,
      failed: shape.failed + preErrors.length,
    };
  }
  if (preErrors.length) {
    return { results: preErrors, succeeded: 0, failed: preErrors.length };
  }
  if (resolvedCount > 1) {
    return {
      results: Array.from({ length: resolvedCount }, (_, i) => ({
        id: `theme-${i}`,
        ok: false,
        error: 'Install response missing bulk results.',
      })),
      succeeded: 0,
      failed: resolvedCount,
    };
  }
  return { results: [{ id: 'theme', ok: true }], succeeded: 1, failed: 0 };
}

export default async function handleThemesInstall(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const norm = normalizeThemeInstallBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);

  const siteIdStr = String(siteId);
  const resolvedRows: Record<string, unknown>[] = [];
  const preErrors: BulkOperationResult[] = [];

  for (const item of norm.body.themes) {
    const r = await runOneThemeInstall(ctx, item, rawBody);
    if (!r.ok) {
      preErrors.push({ id: r.id, ok: false, error: r.error });
      continue;
    }
    resolvedRows.push(r.row);
  }

  if (resolvedRows.length === 0) {
    return ok(res, { results: preErrors, succeeded: 0, failed: preErrors.length });
  }

  const result = await callBridgeRest(ctx, {
    siteId: siteIdStr,
    bridgePath: 'wphubpro/v1/themes/manage/install',
    method: 'POST',
    body: { themes: resolvedRows },
  });

  if (!result.ok) {
    const failedRows = resolvedRows.map((row, i) => ({
      id: String(row.slug || `theme-${i}`),
      ok: false as const,
      error: result.message || 'Install failed.',
    }));
    return ok(res, {
      results: [...preErrors, ...failedRows],
      succeeded: 0,
      failed: preErrors.length + failedRows.length,
    });
  }

  return ok(res, normalizeInstallResponse(result.responseData, preErrors, resolvedRows.length));
}
