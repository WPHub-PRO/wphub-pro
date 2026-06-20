import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { attachZipSource } from '../../lib/pluginZipSource.ts';
import {
  mergeBulkResponseShape,
  mergeBulkResponses,
  normalizePluginBulkBody,
  pluginDirSlug,
} from '../../lib/normalizeBulkBody.ts';
import type { BulkOperationResult, BulkResponseShape, PluginBulkRow, WpProxyCtx } from '../../lib/types.ts';

function httpsZip(raw: unknown): string {
  const z = String(raw || '').trim();
  return z.startsWith('https://') ? z : '';
}

type PluginUpdateBridgePath =
  | 'wphubpro/v1/plugins/manage/update'
  | 'wphubpro/v1/plugins/manage/install';

type ResolvedPluginUpdate =
  | { ok: true; row: PluginBulkRow; id: string; bridgePath: PluginUpdateBridgePath }
  | { ok: false; id: string; error: string };

async function resolveOnePluginUpdate(
  ctx: WpProxyCtx,
  item: PluginBulkRow,
  topLevelBody: Record<string, unknown>,
): Promise<ResolvedPluginUpdate> {
  const plugin = String(item.plugin || '').trim();
  const slug = String(item.slug || '').trim();
  const version = String(item.version || '').trim();
  const id = plugin || slug || pluginDirSlug(plugin) || 'plugin';
  const zipDirect =
    httpsZip(item.zip_url) ||
    httpsZip(item.zipUrl) ||
    httpsZip(topLevelBody.zip_url) ||
    httpsZip(topLevelBody.zipUrl);

  if (zipDirect) {
    const slugEff = slug || pluginDirSlug(plugin);
    const row: PluginBulkRow = { plugin, slug: slugEff, version: '', zip_url: zipDirect };
    attachZipSource(row, item.source ?? topLevelBody.source);
    return { ok: true, row, id: plugin || slugEff, bridgePath: 'wphubpro/v1/plugins/manage/update' };
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
    const resolved = await getResourceItem.resolvePluginUpdateZipUrl({
      databases: ctx.databases,
      fetchImpl: ctx.fetch,
      log: ctx.log,
      body: {
        plugin,
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
    const slugEff = slug || pluginDirSlug(plugin);
    const row: PluginBulkRow = { plugin, slug: slugEff, version: libVersion || '', zip_url: resolved.zipUrl };
    attachZipSource(row, resolved.source, item.source ?? topLevelBody.source);
    return { ok: true, row, id: plugin || slugEff, bridgePath: 'wphubpro/v1/plugins/manage/update' };
  }

  if (slug && version) {
    return {
      ok: true,
      row: { plugin, slug, version },
      id: plugin || slug,
      bridgePath: 'wphubpro/v1/plugins/manage/install',
    };
  }

  if (slug && plugin) {
    const slugEff = slug || pluginDirSlug(plugin);
    return {
      ok: true,
      row: { plugin, slug: slugEff, version: version || '' },
      id: plugin,
      bridgePath: 'wphubpro/v1/plugins/manage/update',
    };
  }

  const resolved = await getResourceItem.resolvePluginUpdateZipUrl({
    databases: ctx.databases,
    fetchImpl: ctx.fetch,
    log: ctx.log,
    body: { ...topLevelBody, plugin, slug: slug || undefined },
  });
  if (!resolved.ok) {
    return {
      ok: false,
      id,
      error: resolved.message || 'Zip resolve failed.',
    };
  }
  const slugEff2 = slug || pluginDirSlug(plugin);
  const row: PluginBulkRow = { plugin, slug: slugEff2, version: '', zip_url: resolved.zipUrl };
  attachZipSource(row, resolved.source, topLevelBody.source);
  return { ok: true, row, id: plugin || slugEff2, bridgePath: 'wphubpro/v1/plugins/manage/update' };
}

function failedRowsForGroup(
  rows: PluginBulkRow[],
  message: string,
): BulkOperationResult[] {
  return rows.map((row, i) => ({
    id: String(row.plugin || row.slug || `plugin-${i}`),
    ok: false,
    error: message,
  }));
}

async function callPluginUpdateGroup(
  ctx: WpProxyCtx,
  siteId: string,
  bridgePath: PluginUpdateBridgePath,
  rows: PluginBulkRow[],
): Promise<BulkResponseShape | null> {
  if (!rows.length) return null;
  const result = await callBridgeRest(ctx, {
    siteId,
    bridgePath,
    method: 'POST',
    body: { plugins: rows },
  });
  if (!result.ok) {
    return {
      results: failedRowsForGroup(rows, result.message || 'Update failed.'),
      succeeded: 0,
      failed: rows.length,
    };
  }
  return mergeBulkResponseShape(result.responseData);
}

export default async function handlePluginsUpdate(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const norm = normalizePluginBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);

  const siteIdStr = String(siteId);
  const updateRows: PluginBulkRow[] = [];
  const installRows: PluginBulkRow[] = [];
  const preErrors: BulkOperationResult[] = [];

  for (const item of norm.body.plugins) {
    const resolved = await resolveOnePluginUpdate(ctx, item, rawBody);
    if (!resolved.ok) {
      preErrors.push({ id: resolved.id, ok: false, error: resolved.error });
      continue;
    }
    if (resolved.bridgePath === 'wphubpro/v1/plugins/manage/install') {
      installRows.push(resolved.row);
    } else {
      updateRows.push(resolved.row);
    }
  }

  if (updateRows.length === 0 && installRows.length === 0) {
    return ok(res, { results: preErrors, succeeded: 0, failed: preErrors.length });
  }

  const updateShape = await callPluginUpdateGroup(
    ctx,
    siteIdStr,
    'wphubpro/v1/plugins/manage/update',
    updateRows,
  );
  const installShape = await callPluginUpdateGroup(
    ctx,
    siteIdStr,
    'wphubpro/v1/plugins/manage/install',
    installRows,
  );

  return ok(res, mergeBulkResponses(preErrors, updateShape, installShape));
}
