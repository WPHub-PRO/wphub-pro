/**
 * Hub → `wp-proxy` (Appwrite) → WordPress bridge REST: activate / deactivate plugin.
 *
 * @see `postBridgeApiJsonWithMeta` in `@/lib/platform-api`
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 120_000;

export async function runPluginActivateForSite(
  siteId: string,
  pluginPath: string,
): Promise<{ ok: boolean; message: string }> {
  const file = (pluginPath || '').trim();
  if (!file) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  const payload = {
    siteId,
    handler: 'plugins/activate',
    body: { plugin: file },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Plugin activated.' };
    }
    return {
      ok: false,
      message: parseWpProxyFailureMessage(data, statusCode, 'Activation failed.'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function runPluginDeactivateForSite(
  siteId: string,
  pluginPath: string,
): Promise<{ ok: boolean; message: string }> {
  const file = (pluginPath || '').trim();
  if (!file) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  const payload = {
    siteId,
    handler: 'plugins/deactivate',
    body: { plugin: file },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Plugin deactivated.' };
    }
    return {
      ok: false,
      message: parseWpProxyFailureMessage(data, statusCode, 'Deactivation failed.'),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
