import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { attachZipSource } from '../../lib/pluginZipSource.ts';
import {
  httpsZipUrl,
  mergeBulkResponseShape,
  normalizePluginInstallBulkBody,
  parseCompositeLibraryItemId,
  pluginDirSlug,
} from '../../lib/normalizeBulkBody.ts';
import type { BulkOperationResult, PluginInstallBulkRow, WpProxyCtx } from '../../lib/types.ts';

type ResolvedPluginInstall =
  | { ok: true; row: Record<string, unknown>; id: string }
  | { ok: false; id: string; error: string };

function resolvePluginSlugHint(
  item: PluginInstallBulkRow,
  topLevelBody: Record<string, unknown>,
  fallback = '',
): string {
  return String(
    item.slug ||
      item.wpSlug ||
      item.wp_slug ||
      item.routeSlug ||
      item.route_slug ||
      topLevelBody.slug ||
      topLevelBody.wpSlug ||
      topLevelBody.wp_slug ||
      topLevelBody.routeSlug ||
      topLevelBody.route_slug ||
      fallback ||
      '',
  )
    .trim()
    .toLowerCase();
}

function withPluginSlug(row: Record<string, unknown>, slug: string): Record<string, unknown> {
  if (!slug) return row;
  return { ...row, slug };
}

async function runOnePluginInstall(
  ctx: WpProxyCtx,
  item: PluginInstallBulkRow,
  topLevelBody: Record<string, unknown>,
): Promise<ResolvedPluginInstall> {
  const { databases, log } = ctx;
  const plugin = String(item.plugin || '').trim();
  let libraryItemId = String(
    item.libraryItemId || item.library_item_id || topLevelBody.libraryItemId || topLevelBody.library_item_id || '',
  ).trim();
  const routeSlug = String(
    item.routeSlug || item.route_slug || topLevelBody.routeSlug || topLevelBody.route_slug || '',
  ).trim();
  let version = String(item.version || topLevelBody.version || '').trim();
  const slugHint = resolvePluginSlugHint(item, topLevelBody, routeSlug);
  const id = slugHint || pluginDirSlug(plugin) || libraryItemId || 'plugin';

  const parsed = parseCompositeLibraryItemId(libraryItemId, version);
  libraryItemId = parsed.libraryItemId;
  version = parsed.version;

  const zipDirect =
    httpsZipUrl(item.zip_url) ||
    httpsZipUrl(item.zipUrl) ||
    httpsZipUrl(topLevelBody.zip_url) ||
    httpsZipUrl(topLevelBody.zipUrl);

  if (zipDirect) {
    const row = withPluginSlug({ zip_url: zipDirect }, slugHint);
    if (plugin) row.plugin = plugin;
    attachZipSource(row, item.source ?? topLevelBody.source);
    return { ok: true, row, id: slugHint || pluginDirSlug(plugin) || id };
  }

  if (libraryItemId && version) {
    const official = await getResourceItem.resolvePluginLibraryInstallVersion({
      databases,
      libraryItemId,
      routeSlug: routeSlug || slugHint,
      log,
    });
    if (official.ok) {
      const row = withPluginSlug({ slug: official.slug, version: official.version }, official.slug);
      if (plugin) row.plugin = plugin;
      return { ok: true, row, id: official.slug };
    }

    const zipRes = await getResourceItem.resolvePluginUpdateZipUrl({
      databases,
      fetchImpl: ctx.fetch,
      log,
      body: {
        libraryItemId,
        library_item_id: libraryItemId,
        version,
        source: String(item.source || topLevelBody.source || '').trim().toLowerCase(),
        routeSlug: routeSlug || slugHint,
        route_slug: routeSlug || slugHint,
        plugin,
        slug: slugHint || undefined,
      },
    });
    if (!zipRes.ok) {
      return {
        ok: false,
        id,
        error:
          zipRes.message || official.message || 'Could not resolve a ZIP for this library version.',
      };
    }
    const resolvedSlug = slugHint || official.slug || routeSlug;
    const row = withPluginSlug({ zip_url: zipRes.zipUrl }, resolvedSlug);
    if (plugin) row.plugin = plugin;
    attachZipSource(row, zipRes.source, item.source ?? topLevelBody.source);
    return { ok: true, row, id: resolvedSlug || libraryItemId };
  }

  if (libraryItemId && !version) {
    return {
      ok: false,
      id,
      error:
        'body.version is required with libraryItemId for library ZIP installs (local / remote / non–install-version rows).',
    };
  }

  const slug = slugHint;
  if (!slug || !version) {
    return {
      ok: false,
      id,
      error:
        'Provide zip_url, slug + version, or libraryItemId + version for each plugin install row.',
    };
  }
  const row = withPluginSlug({ slug, version }, slug);
  if (plugin) row.plugin = plugin;
  return { ok: true, row, id: slug };
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
  resolvedRows: Record<string, unknown>[],
) {
  const resolvedCount = resolvedRows.length;
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
        id: String(resolvedRows[i]?.slug || resolvedRows[i]?.plugin || `plugin-${i}`),
        ok: false,
        error: 'Install response missing bulk results.',
      })),
      succeeded: 0,
      failed: resolvedCount,
    };
  }
  return {
    results: [
      {
        id: String(resolvedRows[0]?.slug || resolvedRows[0]?.plugin || 'plugin'),
        ok: true,
      },
    ],
    succeeded: 1,
    failed: 0,
  };
}

export default async function handlePluginsInstall(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const norm = normalizePluginInstallBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);

  const siteIdStr = String(siteId);
  const resolvedRows: Record<string, unknown>[] = [];
  const preErrors: BulkOperationResult[] = [];

  for (const item of norm.body.plugins) {
    const r = await runOnePluginInstall(ctx, item, rawBody);
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
    bridgePath: 'wphubpro/v1/plugins/manage/install',
    method: 'POST',
    body: { plugins: resolvedRows },
  });

  if (!result.ok) {
    const failedRows = resolvedRows.map((row, i) => ({
      id: String(row.slug || row.plugin || `plugin-${i}`),
      ok: false as const,
      error: result.message || 'Install failed.',
    }));
    return ok(res, {
      results: [...preErrors, ...failedRows],
      succeeded: 0,
      failed: preErrors.length + failedRows.length,
    });
  }

  return ok(res, normalizeInstallResponse(result.responseData, preErrors, resolvedRows));
}
