/**
 * Hub → `wp-proxy` → bridge: uninstall plugin or delete theme on a site.
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { parseWpProxyFailureMessage } from './wpProxyResponse';
import { summarizeBulkPayload, toBulkPluginItemFromPath, toBulkThemeItemFromStylesheet } from './extensionBulkFromSite';

const PROXY_TIMEOUT_MS = 180_000;

export async function runPluginUninstallForSite(
  siteId: string,
  pluginFile: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkPluginItemFromPath(pluginFile);
  if (!item.plugin) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>(
      '/wp-proxy',
      {
        siteId,
        handler: 'plugins/uninstall',
        body: { plugins: [item] },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    const summary = summarizeBulkPayload(data, statusCode, 'Removed');
    if (statusCode >= 200 && statusCode < 300 && summary.ok) {
      return { ok: true, message: summary.message || 'Plugin removed from the site.' };
    }
    if (statusCode >= 200 && statusCode < 300 && !summary.ok) {
      return { ok: false, message: summary.message };
    }
    return {
      ok: false,
      message: parseWpProxyFailureMessage(data, statusCode, 'Uninstall failed.'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function runThemeDeleteForSite(
  siteId: string,
  stylesheet: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkThemeItemFromStylesheet(stylesheet);
  if (!item.stylesheet) {
    return { ok: false, message: 'Missing theme stylesheet slug.' };
  }

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>(
      '/wp-proxy',
      {
        siteId,
        handler: 'themes/uninstall',
        body: { themes: [item] },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    const summary = summarizeBulkPayload(data, statusCode, 'Removed');
    if (statusCode >= 200 && statusCode < 300 && summary.ok) {
      return { ok: true, message: summary.message || 'Theme removed from the site.' };
    }
    if (statusCode >= 200 && statusCode < 300 && !summary.ok) {
      return { ok: false, message: summary.message };
    }
    return {
      ok: false,
      message: parseWpProxyFailureMessage(data, statusCode, 'Delete failed.'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
