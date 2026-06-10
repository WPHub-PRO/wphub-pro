/**
 * Hub → `wp-proxy` → bridge: activate theme (switch_theme).
 */
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { parseWpProxyFailureMessage } from './wpProxyResponse';
import { summarizeBulkPayload, toBulkThemeItemFromStylesheet } from './extensionBulkFromSite';

const PROXY_TIMEOUT_MS = 120_000;

export async function runThemeActivateForSite(
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
        handler: 'themes/activate',
        body: { themes: [item] },
      },
      {
        timeoutMs: PROXY_TIMEOUT_MS,
        throwOnHttpError: false,
      },
    );
    const summary = summarizeBulkPayload(data, statusCode, 'Activated');
    if (statusCode >= 200 && statusCode < 300 && summary.ok) {
      return { ok: true, message: summary.message || 'Theme activated.' };
    }
    if (statusCode >= 200 && statusCode < 300 && !summary.ok) {
      return { ok: false, message: summary.message };
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
