import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { parseWpProxyFailureMessage } from '@/domains/sites/wpProxyResponse';
import type { WpPluginInfo, WpThemeInfo } from '@/services/wordpress';
import type { LibraryItem } from '@/types';

export type LibraryBridgeInstallPlan =
  | { kind: 'plugin-install-version'; slug: string; version: string }
  | { kind: 'plugin-install-zip'; zipUrl: string; source: LibraryItem['source'] }
  | { kind: 'plugin-install-from-library'; libraryDocumentId: string; version: string; source: LibraryItem['source'] }
  | { kind: 'theme-install-zip'; zipUrl: string; source?: LibraryItem['source'] }
  | { kind: 'theme-install-from-library'; libraryDocumentId: string; version: string; source: LibraryItem['source'] }
  | { kind: 'unsupported'; message: string };

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

/** WordPress.org theme packages: `https://downloads.wordpress.org/theme/{slug}.{version}.zip` */
function themeOrgZipFallback(slug: string, version: string): string | null {
  const s = slug.trim().toLowerCase();
  const v = version.trim();
  if (!s || !v || v === 'latest') return null;
  return `https://downloads.wordpress.org/theme/${encodeURIComponent(s)}.${encodeURIComponent(v)}.zip`;
}

function libraryDocAndVersionKey(item: LibraryItem): { libraryDocumentId: string; version: string } | null {
  const libraryDocumentId = (item.libraryDocumentId ?? item.$id).trim();
  const version = (item.versionKey ?? item.version).trim();
  if (!libraryDocumentId || !version) return null;
  return { libraryDocumentId, version };
}

/**
 * Maps a library row to a wp-proxy → bridge call. Unsupported combinations return a user-facing reason.
 */
export function planLibraryBridgeInstall(
  item: LibraryItem,
  itemKind: 'plugin' | 'theme',
  routeSlug: string,
  wpPluginInfo: WpPluginInfo | null | undefined,
  wpThemeInfo: WpThemeInfo | null | undefined,
): LibraryBridgeInstallPlan {
  const wpSlug = (item.wpSlug ?? routeSlug).trim().toLowerCase();
  if (!wpSlug) {
    return { kind: 'unsupported', message: 'Missing plugin or theme slug for this library item.' };
  }

  if (itemKind === 'plugin') {
    if (item.source === 'official') {
      const v =
        item.version === 'latest'
          ? (wpPluginInfo?.version ?? '').trim()
          : (item.version ?? '').trim();
      if (!v || v === 'latest') {
        return {
          kind: 'unsupported',
          message:
            'Could not resolve a concrete plugin version. Wait for WordPress.org data to load or pin an exact version.',
        };
      }
      return { kind: 'plugin-install-version', slug: wpSlug, version: v };
    }
    if (item.source === 'local') {
      const ids = libraryDocAndVersionKey(item);
      if (!ids) {
        return { kind: 'unsupported', message: 'Missing library document or version for this uploaded build.' };
      }
      return { kind: 'plugin-install-from-library', ...ids, source: 'local' };
    }
    if (item.source === 'remote') {
      const zipUrl = normalizeHttpsZipUrl(item.remoteUrl ?? '');
      if (!zipUrl) {
        return {
          kind: 'unsupported',
          message: 'Remote plugin source must be an HTTPS URL to a ZIP file.',
        };
      }
      return { kind: 'plugin-install-zip', zipUrl, source: 'remote' };
    }
    return { kind: 'unsupported', message: 'Unsupported plugin source.' };
  }

  if (item.source === 'local') {
    const ids = libraryDocAndVersionKey(item);
    if (!ids) {
      return { kind: 'unsupported', message: 'Missing library document or version for this uploaded build.' };
    }
    return { kind: 'theme-install-from-library', ...ids, source: 'local' };
  }

  if (item.source === 'remote') {
    const zipUrl = normalizeHttpsZipUrl(item.remoteUrl ?? '');
    if (!zipUrl) {
      return {
        kind: 'unsupported',
        message: 'Theme remote source must be an HTTPS URL to a ZIP file.',
      };
    }
    return { kind: 'theme-install-zip', zipUrl, source: 'remote' };
  }

  if (item.source === 'official') {
    const ids = libraryDocAndVersionKey(item);
    if (ids && ids.version !== 'latest') {
      return { kind: 'theme-install-from-library', ...ids, source: 'official' };
    }

    let zipUrl = '';
    if (item.version === 'latest') {
      const dl = wpThemeInfo?.download_link ? normalizeHttpsZipUrl(wpThemeInfo.download_link) : null;
      if (dl) zipUrl = dl;
      if (!zipUrl && wpThemeInfo?.version && wpThemeInfo.versions) {
        const u = wpThemeInfo.versions[wpThemeInfo.version];
        zipUrl = u ? normalizeHttpsZipUrl(u) ?? '' : '';
      }
    } else {
      const ver = (item.version ?? '').trim();
      const fromMap = wpThemeInfo?.versions?.[ver];
      if (fromMap) zipUrl = normalizeHttpsZipUrl(fromMap) ?? '';
      if (!zipUrl && wpThemeInfo?.version === ver && wpThemeInfo.download_link) {
        zipUrl = normalizeHttpsZipUrl(wpThemeInfo.download_link) ?? '';
      }
      if (!zipUrl) {
        const fb = themeOrgZipFallback(wpSlug, ver);
        if (fb) zipUrl = fb;
      }
    }
    if (!zipUrl) {
      return {
        kind: 'unsupported',
        message:
          'Could not resolve a theme ZIP for this version. Pin a WordPress.org version or add an HTTPS ZIP URL.',
      };
    }
    return { kind: 'theme-install-zip', zipUrl, source: 'official' };
  }

  return { kind: 'unsupported', message: 'Unsupported theme source.' };
}

export async function runLibraryBridgeInstallOnSite(
  siteId: string,
  plan: LibraryBridgeInstallPlan,
  /** Library item `name` — optional label for install-version only. */
  libraryItemName?: string,
): Promise<{ ok: boolean; message: string }> {
  if (plan.kind === 'unsupported') {
    return { ok: false, message: plan.message };
  }

  const plugin = (libraryItemName ?? '').trim();

  let payload: Record<string, unknown>;
  switch (plan.kind) {
    case 'plugin-install-version':
      payload = {
        siteId,
        handler: 'plugins/install',
        body: { slug: plan.slug, version: plan.version, plugin },
      };
      break;
    case 'plugin-install-zip':
      payload = {
        siteId,
        handler: 'plugins/install',
        body: { zip_url: plan.zipUrl, source: plan.source },
      };
      break;
    case 'plugin-install-from-library':
      payload = {
        siteId,
        handler: 'plugins/install',
        body: {
          libraryItemId: plan.libraryDocumentId,
          version: plan.version,
          source: plan.source,
        },
      };
      break;
    case 'theme-install-zip':
      payload = {
        siteId,
        handler: 'themes/install',
        body: {
          zip_url: plan.zipUrl,
          ...(plan.source ? { source: plan.source } : {}),
          plugin,
        },
      };
      break;
    case 'theme-install-from-library':
      payload = {
        siteId,
        handler: 'themes/install',
        body: {
          libraryItemId: plan.libraryDocumentId,
          version: plan.version,
          source: plan.source,
        },
      };
      break;
    default: {
      const _exhaustive: never = plan;
      void _exhaustive;
      return { ok: false, message: 'Unknown install plan.' };
    }
  }

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: 180_000,
      throwOnHttpError: false,
    });

    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Installed.' };
    }

    return { ok: false, message: parseWpProxyFailureMessage(data, statusCode, 'Install failed.') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
