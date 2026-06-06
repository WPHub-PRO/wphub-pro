/**
 * Hub → `wp-proxy` → bridge: uninstall plugin or delete theme on a site.
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 180_000;

export async function runPluginUninstallForSite(
  siteId: string,
  pluginFile: string,
): Promise<{ ok: boolean; message: string }> {
  const file = (pluginFile || '').trim();
  if (!file) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  const payload = {
    siteId,
    handler: 'plugins/uninstall',
    body: { plugin: file },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Plugin removed from the site.' };
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
  const slug = (stylesheet || '').trim();
  if (!slug) {
    return { ok: false, message: 'Missing theme stylesheet slug.' };
  }

  const payload = {
    siteId,
    handler: 'themes/de-install',
    body: { slug },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Theme removed from the site.' };
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
