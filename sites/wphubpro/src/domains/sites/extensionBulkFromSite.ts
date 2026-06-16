/**
 * Hub → wp-proxy → bridge: bulk plugin/theme actions (`body.plugins` / `body.themes` object arrays).
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import type { WordPressPlugin, WordPressTheme } from '@/types';
import { formatAvailableUpdate } from './installedMeta';
import { pluginDirectorySlug } from './pluginUpdateFromSite';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 180_000;

export type BulkPluginItem = { plugin: string; slug: string; version: string };

export type BulkThemeItem = { stylesheet: string; slug: string; version: string };

export type BulkItemResult = { id: string; ok: boolean; error?: string };

export type BulkRunResult = { ok: boolean; message: string; results: BulkItemResult[] };

export function toBulkPluginItem(row: WordPressPlugin): BulkPluginItem {
  const plugin = (row.plugin || '').trim();
  const slug = pluginDirectorySlug(plugin) || (row as { slug?: string }).slug?.trim() || '';
  const version = (row.version || '').trim();
  return { plugin, slug, version };
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
  if (!data || typeof data !== 'object') {
    return { ok: true, message: `${successVerb}.`, results: [] };
  }
  const d = data as Record<string, unknown>;
  const raw = d.results;
  if (!Array.isArray(raw)) {
    return { ok: true, message: `${successVerb}.`, results: [] };
  }
  const results: BulkItemResult[] = raw.map((r) => {
    if (!r || typeof r !== 'object') return { id: '', ok: false, error: 'Invalid result entry' };
    const o = r as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const ok = Boolean(o.ok);
    const error = typeof o.error === 'string' ? o.error : undefined;
    return { id, ok, error };
  });
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

export type ThemesBulkAction = 'update' | 'delete';

const THEME_HANDLER: Record<ThemesBulkAction, string> = {
  update: 'themes/update',
  delete: 'themes/de-install',
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
  const label = action === 'update' ? 'Updated' : 'Removed';
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
