import { ok, fail } from '@code045/wphubpro-shared';
import { callBridgeRest } from '../../lib/connectBridge.ts';
import * as getResourceItem from '../../lib/getResourceItem.ts';
import { attachPluginZipSource } from '../../lib/pluginZipSource.ts';
import {
  normalizePluginBulkBody,
  mergeBulkResponseShape,
  pluginDirSlug,
} from '../../lib/normalizeBulkBody.ts';
import type { BridgeRestResult, PluginBulkRow, WpProxyCtx } from '../../lib/types.ts';

function httpsZip(raw: unknown): string {
  const z = String(raw || '').trim();
  return z.startsWith('https://') ? z : '';
}

async function runOnePluginUpdate(
  ctx: WpProxyCtx,
  siteId: string,
  item: PluginBulkRow,
  topLevelBody: Record<string, unknown>,
): Promise<BridgeRestResult> {
  const plugin = String(item.plugin || '').trim();
  const slug = String(item.slug || '').trim();
  const version = String(item.version || '').trim();
  const zipDirect =
    httpsZip(item.zip_url) ||
    httpsZip(item.zipUrl) ||
    httpsZip(topLevelBody.zip_url) ||
    httpsZip(topLevelBody.zipUrl);

  if (zipDirect) {
    const slugEff = slug || pluginDirSlug(plugin);
    const row: PluginBulkRow = { plugin, slug: slugEff, version: '', zip_url: zipDirect };
    attachPluginZipSource(row, item.source ?? topLevelBody.source);
    return callBridgeRest(ctx, {
      siteId,
      bridgePath: 'wphubpro/v1/plugins/manage/update',
      method: 'POST',
      body: { plugins: [row] },
    });
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
        statusCode: resolved.statusCode || 400,
        message: resolved.message || 'Zip resolve failed.',
      };
    }
    const slugEff = slug || pluginDirSlug(plugin);
    const row: PluginBulkRow = { plugin, slug: slugEff, version: libVersion || '', zip_url: resolved.zipUrl };
    attachPluginZipSource(row, resolved.source, item.source ?? topLevelBody.source);
    return callBridgeRest(ctx, {
      siteId,
      bridgePath: 'wphubpro/v1/plugins/manage/update',
      method: 'POST',
      body: { plugins: [row] },
    });
  }

  if (slug && version) {
    return callBridgeRest(ctx, {
      siteId,
      bridgePath: 'wphubpro/v1/plugins/manage/install',
      method: 'POST',
      body: { plugin, slug, version },
    });
  }

  if (slug && plugin) {
    const slugEff = slug || pluginDirSlug(plugin);
    return callBridgeRest(ctx, {
      siteId,
      bridgePath: 'wphubpro/v1/plugins/manage/update',
      method: 'POST',
      body: { plugins: [{ plugin, slug: slugEff, version: version || '' }] },
    });
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
      statusCode: resolved.statusCode || 400,
      message: resolved.message || 'Zip resolve failed.',
    };
  }
  const slugEff2 = slug || pluginDirSlug(plugin);
  const row: PluginBulkRow = { plugin, slug: slugEff2, version: '', zip_url: resolved.zipUrl };
  attachPluginZipSource(row, resolved.source, topLevelBody.source);
  return callBridgeRest(ctx, {
    siteId,
    bridgePath: 'wphubpro/v1/plugins/manage/update',
    method: 'POST',
    body: { plugins: [row] },
  });
}

function normalizeOneUpdateResponse(responseData: unknown, pluginId: string) {
  const shape = mergeBulkResponseShape(responseData);
  if (shape) return shape;
  return { results: [{ id: pluginId, ok: true }], succeeded: 1, failed: 0 };
}

export default async function handlePluginsUpdate(ctx: WpProxyCtx) {
  const { res, payload } = ctx;
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);
  const rawBody = payload.body && typeof payload.body === 'object' ? { ...payload.body } : {};
  const norm = normalizePluginBulkBody(rawBody);
  if (!norm.ok) return fail(res, norm.message, 400);

  const plugins = norm.body.plugins;
  const siteIdStr = String(siteId);
  if (plugins.length === 1) {
    const r = await runOnePluginUpdate(ctx, siteIdStr, plugins[0], rawBody);
    if (!r.ok) return fail(res, r.message, r.statusCode || 500, r.details);
    return ok(res, normalizeOneUpdateResponse(r.responseData, String(plugins[0].plugin || '').trim()));
  }

  const merged = { results: [] as { id: string; ok: boolean; error?: string }[], succeeded: 0, failed: 0 };
  for (const item of plugins) {
    const pid = String(item.plugin || '').trim();
    const r = await runOnePluginUpdate(ctx, siteIdStr, item, rawBody);
    if (!r.ok) {
      merged.results.push({ id: pid, ok: false, error: r.message || 'Update failed.' });
      merged.failed += 1;
      continue;
    }
    const one = normalizeOneUpdateResponse(r.responseData, pid);
    merged.results.push(...one.results);
    merged.succeeded += one.succeeded;
    merged.failed += one.failed;
  }
  return ok(res, merged);
}
