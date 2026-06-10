/**
 * Hub → `wp-proxy` (Appwrite) → WordPress bridge REST: activate / deactivate plugin.
 *
 * @see `postBridgeApiJsonWithMeta` in `@/lib/platform-api`
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { summarizeBulkPayload, toBulkPluginItemFromPath } from './extensionBulkFromSite';

const PROXY_TIMEOUT_MS = 120_000;

export async function runPluginActivateForSite(
  siteId: string,
  pluginPath: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkPluginItemFromPath(pluginPath);
  if (!item.plugin) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>(
      '/wp-proxy',
      {
        siteId,
        handler: 'plugins/activate',
        body: { plugins: [item] },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    const summary = summarizeBulkPayload(data, statusCode, 'Activated');
    return { ok: summary.ok, message: summary.message || 'Plugin activated.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

export async function runPluginDeactivateForSite(
  siteId: string,
  pluginPath: string,
): Promise<{ ok: boolean; message: string }> {
  const item = toBulkPluginItemFromPath(pluginPath);
  if (!item.plugin) {
    return { ok: false, message: 'Missing plugin file path.' };
  }

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>(
      '/wp-proxy',
      {
        siteId,
        handler: 'plugins/deactivate',
        body: { plugins: [item] },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    const summary = summarizeBulkPayload(data, statusCode, 'Deactivated');
    return { ok: summary.ok, message: summary.message || 'Plugin deactivated.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
