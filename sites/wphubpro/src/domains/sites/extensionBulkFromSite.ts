/**
 * Hub → wp-proxy → bridge: bulk plugin/theme actions (`body.plugins` / `body.themes` object arrays).
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import type { WordPressPlugin, WordPressTheme } from '@/types';
import { formatAvailableUpdate } from './installedMeta';
import { isBridgePluginFile, pluginDirectorySlug } from './pluginUpdateFromSite';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 180_000;

export type BulkPluginItem = { plugin: string; slug: string; version: string };

export type BulkThemeItem = { stylesheet: string; slug: string; version: string };

export type BulkItemResult = {
  id: string;
  ok: boolean;
  installed?: boolean;
  activated?: boolean;
  error?: string;
};

export type BulkRunResult = { ok: boolean; message: string; results: BulkItemResult[] };

/** Index bulk rows by id and, for plugin paths, by directory slug (before `/`). */
export function indexBulkResultsForSlugLookup(
  results: BulkItemResult[],
): Map<string, BulkItemResult> {
  const map = new Map<string, BulkItemResult>();
  for (const row of results) {
    const id = row.id.trim().toLowerCase();
    if (!id) continue;
    if (!map.has(id)) map.set(id, row);
    const slash = id.indexOf('/');
    if (slash > 0) {
      const dirSlug = id.slice(0, slash);
      if (dirSlug && !map.has(dirSlug)) map.set(dirSlug, row);
    }
  }
  return map;
}

export function lookupBulkResultForSlug(
  byId: Map<string, BulkItemResult>,
  slug: string,
): BulkItemResult | undefined {
  const key = slug.trim().toLowerCase();
  if (!key) return undefined;
  return byId.get(key);
}

/** Match a bulk row to an install entry by slug keys, then by request order. */
export function lookupBulkResultForInstallEntry(
  byId: Map<string, BulkItemResult>,
  slugs: string[],
  bulkResults: BulkItemResult[],
  index: number,
): BulkItemResult | undefined {
  for (const slug of slugs) {
    const hit = lookupBulkResultForSlug(byId, slug);
    if (hit) return hit;
  }
  if (index >= 0 && index < bulkResults.length) {
    return bulkResults[index];
  }
  return undefined;
}

export function bulkLineMessage(row: BulkItemResult, fallback = 'Install failed.'): string {
  if (row.ok) return 'Installed.';
  if (row.installed === true && row.activated === false) {
    const detail = row.error?.trim();
    return detail
      ? `Installed but activation failed: ${detail}`
      : 'Installed but the plugin could not be activated on the site.';
  }
  return (row.error ?? '').trim() || fallback;
}

function pickString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function coerceOptionalBool(v: unknown): boolean | undefined {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return undefined;
}

function looksLikeBulkResultRow(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.id != null ||
    o.ok != null ||
    o.plugin_file != null ||
    o.pluginFile != null ||
    o.plugin != null ||
    o.slug != null ||
    o.stylesheet != null ||
    o.error != null ||
    o.installed != null ||
    o.activated != null
  );
}

/** Pull a bulk `results` array from wp-proxy / bridge JSON (several legacy shapes). */
export function extractBulkResultsArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) {
    if (data.length === 0 || data.every(looksLikeBulkResultRow)) return data;
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const nestedObjects: Record<string, unknown>[] = [];
  const d = data as Record<string, unknown>;
  nestedObjects.push(d);
  for (const key of ['data', 'response', 'payload', 'body'] as const) {
    const nested = d[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      nestedObjects.push(nested as Record<string, unknown>);
    }
  }

  for (const obj of nestedObjects) {
    const results = obj.results;
    if (Array.isArray(results)) return results;
    if (results && typeof results === 'object' && !Array.isArray(results)) {
      return Object.values(results as Record<string, unknown>);
    }
  }

  return null;
}

/** Fallback when wp-proxy succeeded but Appwrite omitted the execution response body. */
export function synthesizeBulkResultsFromInstallRows(
  rows: { slug?: string; routeSlug?: string }[],
): BulkItemResult[] {
  return rows.map((row, index) => {
    const id = (row.slug || row.routeSlug || `item-${index}`).trim();
    return {
      id,
      ok: true,
      installed: true,
      activated: true,
    };
  });
}

export function normalizeBulkItemRow(r: unknown): BulkItemResult {
  if (!r || typeof r !== 'object') return { id: '', ok: false, error: 'Invalid result entry' };
  const o = r as Record<string, unknown>;
  const id =
    pickString(o.id) ||
    pickString(o.plugin_file) ||
    pickString(o.pluginFile) ||
    pickString(o.plugin) ||
    pickString(o.slug) ||
    pickString(o.stylesheet) ||
    '';
  const ok =
    o.ok === true ||
    o.ok === 1 ||
    o.ok === '1' ||
    o.ok === 'true';
  const error = typeof o.error === 'string' ? o.error : undefined;
  const installed = coerceOptionalBool(o.installed);
  const activated = coerceOptionalBool(o.activated);
  return { id, ok, error, installed, activated };
}

export function toBulkPluginItem(row: WordPressPlugin): BulkPluginItem {
  const plugin = (row.plugin || '').trim();
  const slug = pluginDirectorySlug(plugin) || (row as { slug?: string }).slug?.trim() || '';
  const version = (row.version || '').trim();
  return { plugin, slug, version };
}

/** Target version from bridge `update` metadata (routes wp-proxy through manage/install). */
export function toBulkPluginItemForUpdate(row: WordPressPlugin): BulkPluginItem {
  const base = toBulkPluginItem(row);
  if (isBridgePluginFile(base.plugin)) {
    return { ...base, version: '' };
  }
  const target = formatAvailableUpdate(row.update);
  return {
    ...base,
    version: target !== '—' ? target : '',
  };
}

export function toBulkThemeItem(row: WordPressTheme): BulkThemeItem {
  const stylesheet = (row.stylesheet || '').trim();
  const slug = stylesheet;
  const version = (row.version || '').trim();
  return { stylesheet, slug, version };
}

export function toBulkThemeItemForUpdate(theme: WordPressTheme): BulkThemeItem {
  const base = toBulkThemeItem(theme);
  const target = formatAvailableUpdate(theme.update);
  return {
    ...base,
    version: target !== '—' ? target : base.version,
  };
}

export function toBulkThemeItemFromStylesheet(stylesheet: string): BulkThemeItem {
  const s = (stylesheet || '').trim();
  return { stylesheet: s, slug: s, version: '' };
}

/** Single plugin path (row actions without full `WordPressPlugin`). */
export function toBulkPluginItemFromPath(pluginPath: string): BulkPluginItem {
  const plugin = (pluginPath || '').trim();
  return {
    plugin,
    slug: pluginDirectorySlug(plugin),
    version: '',
  };
}

export function summarizeBulkPayload(
  data: unknown,
  statusCode: number,
  successVerb: string,
): BulkRunResult {
  if (statusCode < 200 || statusCode >= 300) {
    return {
      ok: false,
      message: parseWpProxyFailureMessage(data, statusCode, `${successVerb} failed.`),
      results: [],
    };
  }
  const raw = extractBulkResultsArray(data);
  if (!raw) {
    return { ok: true, message: `${successVerb}.`, results: [] };
  }
  const results: BulkItemResult[] = raw.map(normalizeBulkItemRow);
  const failed = results.filter((x) => !x.ok);
  const succeeded = results.filter((x) => x.ok);
  if (results.length === 0) {
    return { ok: true, message: `${successVerb}.`, results };
  }
  if (failed.length === 0) {
    return { ok: true, message: `${successVerb} (${succeeded.length}).`, results };
  }
  if (succeeded.length === 0) {
    return {
      ok: false,
      message: failed.map((f) => `${f.id || 'item'}: ${f.error || 'failed'}`).join('; '),
      results,
    };
  }
  return {
    ok: true,
    message: `${successVerb}: ${succeeded.length} ok, ${failed.length} failed — ${failed
      .map((f) => `${f.id || 'item'}: ${f.error || 'failed'}`)
      .join('; ')}`,
    results,
  };
}

export type PluginsBulkAction = 'activate' | 'deactivate' | 'update' | 'delete';

const PLUGIN_HANDLER: Record<PluginsBulkAction, string> = {
  activate: 'plugins/activate',
  deactivate: 'plugins/deactivate',
  update: 'plugins/update',
  delete: 'plugins/uninstall',
};

export async function runPluginsBulkForSite(
  siteId: string,
  action: PluginsBulkAction,
  items: BulkPluginItem[],
): Promise<BulkRunResult> {
  if (!items.length) {
    return { ok: false, message: 'No plugins selected.', results: [] };
  }
  const handler = PLUGIN_HANDLER[action];
  const label =
    action === 'activate'
      ? 'Activated'
      : action === 'deactivate'
        ? 'Deactivated'
        : action === 'update'
          ? 'Updated'
          : 'Removed';
  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>(
      '/wp-proxy',
      {
        siteId,
        handler,
        body: { plugins: items },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    return summarizeBulkPayload(data, statusCode, label);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg, results: [] };
  }
}

export type ThemesBulkAction = 'activate' | 'update' | 'delete';

const THEME_HANDLER: Record<ThemesBulkAction, string> = {
  activate: 'themes/activate',
  update: 'themes/update',
  delete: 'themes/delete',
};

export async function runThemesBulkForSite(
  siteId: string,
  action: ThemesBulkAction,
  items: BulkThemeItem[],
): Promise<BulkRunResult> {
  if (!items.length) {
    return { ok: false, message: 'No themes selected.', results: [] };
  }
  const handler = THEME_HANDLER[action];
  const label =
    action === 'activate' ? 'Activated' : action === 'update' ? 'Updated' : 'Removed';
  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>(
      '/wp-proxy',
      {
        siteId,
        handler,
        body: { themes: items },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    return summarizeBulkPayload(data, statusCode, label);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg, results: [] };
  }
}

function toSimpleSiteResult(summary: BulkRunResult, fallbackOk: string): { ok: boolean; message: string } {
  return {
    ok: summary.ok,
    message: summary.message || fallbackOk,
  };
}

export async function runPluginActivateForSite(
  siteId: string,
  pluginPath: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkPluginItemFromPath(pluginPath);
  if (!item.plugin) return { ok: false, message: 'Missing plugin file path.' };
  const summary = await runPluginsBulkForSite(siteId, 'activate', [item]);
  return toSimpleSiteResult(summary, 'Plugin activated.');
}

export async function runPluginDeactivateForSite(
  siteId: string,
  pluginPath: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkPluginItemFromPath(pluginPath);
  if (!item.plugin) return { ok: false, message: 'Missing plugin file path.' };
  const summary = await runPluginsBulkForSite(siteId, 'deactivate', [item]);
  return toSimpleSiteResult(summary, 'Plugin deactivated.');
}

export async function runPluginUninstallForSite(
  siteId: string,
  pluginFile: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkPluginItemFromPath(pluginFile);
  if (!item.plugin) return { ok: false, message: 'Missing plugin file path.' };
  const summary = await runPluginsBulkForSite(siteId, 'delete', [item]);
  return toSimpleSiteResult(summary, 'Plugin removed from the site.');
}

export async function runThemeActivateForSite(
  siteId: string,
  stylesheet: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkThemeItemFromStylesheet(stylesheet);
  if (!item.stylesheet) return { ok: false, message: 'Missing theme stylesheet slug.' };
  const summary = await runThemesBulkForSite(siteId, 'activate', [item]);
  return toSimpleSiteResult(summary, 'Theme activated.');
}

export async function runThemeDeleteForSite(
  siteId: string,
  stylesheet: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkThemeItemFromStylesheet(stylesheet);
  if (!item.stylesheet) return { ok: false, message: 'Missing theme stylesheet slug.' };
  const summary = await runThemesBulkForSite(siteId, 'delete', [item]);
  return toSimpleSiteResult(summary, 'Theme removed from the site.');
}
