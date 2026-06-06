/**
 * Hub → `wp-proxy` → bridge: update installed theme (WordPress.org or library ZIP).
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { getWpThemeInfo } from '@/services/wordpress';
import type { LibraryItem, WordPressTheme } from '@/types';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 180_000;

export type SiteThemeUpdateChoice =
  | { kind: 'wordpress_org' }
  | { kind: 'library'; item: LibraryItem };

export async function runThemeUpdateForSite(
  siteId: string,
  theme: WordPressTheme,
  choice: SiteThemeUpdateChoice,
): Promise<{ ok: boolean; message: string }> {
  const slug = (theme.stylesheet || '').trim();
  if (!slug) {
    return { ok: false, message: 'Missing theme stylesheet slug.' };
  }

  if (choice.kind === 'library') {
    if (choice.item.type !== 'theme') {
      return { ok: false, message: 'Not a library theme item.' };
    }
    if (choice.item.source === 'local' || choice.item.source === 'remote') {
      const libraryDocumentId = (choice.item.libraryDocumentId ?? choice.item.$id).trim();
      const version = (choice.item.versionKey ?? choice.item.version).trim();
      if (!libraryDocumentId || !version) {
        return { ok: false, message: 'Missing library document or version for this package.' };
      }
      const payload = {
        siteId,
        handler: 'themes/update',
        body: {
          slug,
          libraryItemId: libraryDocumentId,
          version,
          source: choice.item.source,
        },
      };
      try {
        const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
          timeoutMs: PROXY_TIMEOUT_MS,
          throwOnHttpError: false,
        });
        if (statusCode >= 200 && statusCode < 300) {
          return { ok: true, message: 'Theme update completed.' };
        }
        return { ok: false, message: parseWpProxyFailureMessage(data, statusCode, 'Update failed.') };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg };
      }
    }
    if (choice.item.source === 'official') {
      const pinned = (choice.item.version || '').trim();
      const wantsPinned =
        pinned && pinned.toLowerCase() !== 'latest';
      if (wantsPinned) {
        const libraryDocumentId = (choice.item.libraryDocumentId ?? choice.item.$id).trim();
        const version = (choice.item.versionKey ?? choice.item.version).trim();
        if (!libraryDocumentId || !version) {
          return { ok: false, message: 'Missing library document or version for this package.' };
        }
        const payload = {
          siteId,
          handler: 'themes/update',
          body: {
            slug,
            libraryItemId: libraryDocumentId,
            version,
            source: 'official',
          },
        };
        try {
          const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
            timeoutMs: PROXY_TIMEOUT_MS,
            throwOnHttpError: false,
          });
          if (statusCode >= 200 && statusCode < 300) {
            return { ok: true, message: 'Theme update completed.' };
          }
          return { ok: false, message: parseWpProxyFailureMessage(data, statusCode, 'Update failed.') };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: msg };
        }
      }
    }
  }

  const org = await getWpThemeInfo(slug);
  if (!org?.version && choice.kind === 'wordpress_org') {
    return {
      ok: false,
      message: `No WordPress.org data for this theme (slug: ${slug}).`,
    };
  }

  const payload = {
    siteId,
    handler: 'themes/update',
    body: { slug },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Theme update completed.' };
    }
    return { ok: false, message: parseWpProxyFailureMessage(data, statusCode, 'Update failed.') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
