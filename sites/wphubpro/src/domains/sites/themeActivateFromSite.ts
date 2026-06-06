/**
 * Hub → `wp-proxy` → bridge: activate theme (switch_theme).
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { parseWpProxyFailureMessage } from './wpProxyResponse';

const PROXY_TIMEOUT_MS = 120_000;

export async function runThemeActivateForSite(
  siteId: string,
  stylesheet: string,
): Promise<{ ok: boolean; message: string }> {
  const slug = (stylesheet || '').trim();
  if (!slug) {
    return { ok: false, message: 'Missing theme stylesheet slug.' };
  }

  const payload = {
    siteId,
    handler: 'themes/activate',
    body: { slug },
  };

  try {
    const { statusCode, data } = await postBridgeApiJsonWithMeta<unknown>('/wp-proxy', payload, {
      timeoutMs: PROXY_TIMEOUT_MS,
      throwOnHttpError: false,
    });
    if (statusCode >= 200 && statusCode < 300) {
      return { ok: true, message: 'Theme activated.' };
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
