/**
 * Hub → `wp-proxy` (Appwrite) → WordPress bridge REST.
 *
 * **Standard plugins (not WPHubPro Bridge):**
 * - `POST` `wphubpro/v1/plugins/manage/install-version` with JSON body `{ plugin, slug, version }`.
 * - The bridge downloads the package from **WordPress.org** only (`Plugins::install_plugin_version` in the bridge).
 * - Library row with `source: official` uses the same path; a pinned version is used only if it still exists in `versions` on org.
 *
 * **WPHubPro Bridge plugin:**
 * - `POST` `wphubpro/v1/plugins/manage/update` with `{ plugin, zip_url }` where `zip_url` is the platform HTTPS URL
 *   (see `fetchBridgeDownloadMeta`); the WordPress site fetches the zip over HTTPS (not inlined by `wp-proxy`).
 *
 * **Local / remote library packages (zips not on WordPress.org):**
 * - `plugins/update` with `libraryItemId`, `version`, and `source` lets wp-proxy resolve an HTTPS `zip_url` (Appwrite Storage download URL, legacy S3 presign, or remote URL)
 *   and the bridge upgrades the installed plugin from that zip (`plugins/manage/update` with `zip_url`).
 *
 * @see `postBridgeApiJsonWithMeta` in `@/lib/platform-api`
 */
import { fetchBridgeDownloadMeta } from '@/domains/bridge/bridgeRelease';
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { getWpPluginInfo } from '@/services/wordpress';
import type { LibraryItem, WordPressPlugin } from '@/types';
import type { SortingFn } from '@tanstack/react-table';
import { summarizeBulkPayload, toBulkPluginItem } from './extensionBulkFromSite';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 180_000;

const BRIDGE_FILE = 'wphubpro-bridge/wphubpro-bridge.php';

/**
 * Slug = plugin directory (first path segment of `wphubpro-pro/wphubpro-pro.php`).
 */
export function pluginDirectorySlug(pluginPath: string): string {
  const t = (pluginPath || '').replace(/\\/g, '/').trim();
  if (!t) return '';
  const i = t.indexOf('/');
  return (i < 0 ? t : t.slice(0, i)).toLowerCase();
}

/** Matches WPHubPro\Plugin\BridgeGuard::is_bridge_plugin (PHP). */
export function isBridgePluginFile(pluginPath: string): boolean {
  if (!pluginPath) return false;
  return (
    pluginPath === BRIDGE_FILE || pluginPath.startsWith('wphubpro-bridge/')
  );
}

function compareInstalledPluginColumnValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/** Site detail plugins table: WPHub Pro Bridge always sorts above other plugins. */
export const siteInstalledPluginSortingFn: SortingFn<WordPressPlugin> = (rowA, rowB, columnId) => {
  const aBridge = isBridgePluginFile(rowA.original.plugin);
  const bBridge = isBridgePluginFile(rowB.original.plugin);
  if (aBridge !== bBridge) return aBridge ? -1 : 1;
  return compareInstalledPluginColumnValues(rowA.getValue(columnId), rowB.getValue(columnId));
};

/** Default list order for installed plugins (bridge first, then name). */
export function sortInstalledPluginsWithBridgeFirst(plugins: WordPressPlugin[]): WordPressPlugin[] {
  return [...plugins].sort((a, b) => {
    const aBridge = isBridgePluginFile(a.plugin);
    const bBridge = isBridgePluginFile(b.plugin);
    if (aBridge !== bBridge) return aBridge ? -1 : 1;
    return (a.name || a.plugin).localeCompare(b.name || b.plugin, undefined, { sensitivity: 'base' });
  });
}

export type SitePluginUpdateChoice =
  /** Latest version from the WordPress.org API for this plugin slug. */
  | { kind: 'wordpress_org' }
  /**
   * A library row for this slug: `official` uses WordPress.org / install-version; `local` and `remote`
   * use wp-proxy to resolve an HTTPS zip for `plugins/update`.
   */
  | { kind: 'library'; item: LibraryItem };

function normalizeHttpsZipUrl(url: string): string | null {
  const t = url.trim();
  if (!t.startsWith('https://')) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Runs a one-click plugin update from the Hub. Prefer `install-version` (WP.org) for
 * normal plugins. Bridge plugin: `plugins/manage/update` with platform zip.
 */
export async function runPluginUpdateForSite(
  siteId: string,
  plugin: WordPressPlugin,
  choice: SitePluginUpdateChoice,
): Promise<{ ok: boolean; message: string }> {
  const file = (plugin.plugin || '').trim();
  if (!file) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  if (isBridgePluginFile(file)) {
    if (choice.kind === 'library' && choice.item.source !== 'official') {
      return {
        ok: false,
        message:
          'WPHubPro Bridge updates from local/remote library sources are not available yet. Use the WordPress.org / platform build option.',
      };
    }
    const meta = await fetchBridgeDownloadMeta();
    const downloadUrl = normalizeHttpsZipUrl(typeof meta?.downloadUrl === 'string' ? meta.downloadUrl : '');
    if (!meta?.success || !downloadUrl) {
      return {
        ok: false,
        message:
          'Could not resolve a platform download URL for the WPHubPro Bridge. Check bridge releases in the hub.',
      };
    }
    const base = toBulkPluginItem(plugin);
    const payload = {
      siteId,
      handler: 'plugins/update',
      body: {
        plugins: [{ ...base, zip_url: downloadUrl }],
      },
    };
    try {
      const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      });
      if (statusCode >= 200 && statusCode < 300) {
        const s = summarizeBulkPayload(data, statusCode, 'Updated');
        return { ok: s.ok, message: s.ok ? 'Bridge update completed.' : s.message };
      }
      return {
        ok: false,
        message: parseWpProxyFailureMessage(data, statusCode, 'Update failed.'),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    }
  }

  if (choice.kind === 'library') {
    if (choice.item.type !== 'plugin') {
      return { ok: false, message: 'Not a library plugin item.' };
    }
    if (choice.item.source === 'local' || choice.item.source === 'remote') {
      const libraryDocumentId = (choice.item.libraryDocumentId ?? choice.item.$id).trim();
      const version = (choice.item.versionKey ?? choice.item.version).trim();
      if (!libraryDocumentId || !version) {
        return { ok: false, message: 'Missing library document or version for this package.' };
      }
      const base = toBulkPluginItem(plugin);
      const payload = {
        siteId,
        handler: 'plugins/update',
        body: {
          plugins: [
            {
              ...base,
              libraryItemId: libraryDocumentId,
              version,
              source: choice.item.source,
            },
          ],
        },
      };
      try {
        const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
          timeoutMs: PROXY_TIMEOUT_MS,
          throwOnHttpError: false,
        });
        if (statusCode >= 200 && statusCode < 300) {
          const s = summarizeBulkPayload(data, statusCode, 'Updated');
          return { ok: s.ok, message: s.ok ? 'Plugin update completed.' : s.message };
        }
        return { ok: false, message: parseWpProxyFailureMessage(data, statusCode, 'Update failed.') };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg };
      }
    }
  }

  const slug = pluginDirectorySlug(file);
  if (!slug) {
    return { ok: false, message: 'Could not derive plugin slug from the installed path.' };
  }

  const org = await getWpPluginInfo(slug);
  if (!org || !org.version) {
    return {
      ok: false,
      message: `No WordPress.org data for this plugin (slug: ${slug}). The repository may be private or use a custom slug.`,
    };
  }
  const pinnedFromLibrary =
    choice.kind === 'library' && choice.item.source === 'official'
      ? (choice.item.version || '').trim()
      : '';
  const wantsPinned =
    pinnedFromLibrary && pinnedFromLibrary.toLowerCase() !== 'latest' && org.versions?.[pinnedFromLibrary];
  const version = (wantsPinned ? pinnedFromLibrary : org.version).trim();
  if (!version) {
    return { ok: false, message: 'WordPress.org returned an empty version.' };
  }

  const payload = {
    siteId,
    handler: 'plugins/update',
    body: {
      plugins: [{ plugin: file, slug, version }],
    },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      const s = summarizeBulkPayload(data, statusCode, 'Updated');
      return { ok: s.ok, message: s.ok ? 'Plugin update completed.' : s.message };
    }
    return { ok: false, message: parseWpProxyFailureMessage(data, statusCode, 'Update failed.') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
