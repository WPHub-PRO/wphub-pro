/**
 * Bridge (WordPress proxy) via the `wp-proxy` Appwrite function — not same-origin `/api/bridge`.
 */
import { executeFunctionWithMeta } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type PlatformApiWithMeta<T> = {
  data: T;
  statusCode: number;
};

/**
 * POST JSON to the `wp-proxy` Appwrite function. `_path` is ignored (legacy `/wp-proxy`).
 *
 * **Preferred:** `{ siteId, handler, body? }` — `handler` like `plugins/update`, `plugins/uninstall`, `themes/install`, `bridge_force_update`.
 * **Legacy:** `{ siteId, endpoint, method?, body? }` for health and older clients (no `handler`).
 */
export async function postBridgeApiJsonWithMeta<T>(
  _path: string,
  body: unknown,
  options: { timeoutMs?: number; throwOnHttpError?: boolean } = {},
): Promise<PlatformApiWithMeta<T>> {
  const { timeoutMs = 180_000, throwOnHttpError = false } = options;
  const { data, statusCode } = await executeFunctionWithMeta<T>(
    APPWRITE_FUNCTION_IDS.WP_PROXY,
    body as Record<string, unknown>,
    {
      longRunning: true,
      maxAsyncWaitMs: timeoutMs,
      throwOnHttpError,
      parseJson: true,
    },
  );
  return { data, statusCode };
}
