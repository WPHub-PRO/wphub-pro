/**
 * Bridge (WordPress proxy) via the `wp-proxy` Appwrite function — not same-origin `/api/bridge`.
 */
import { executeFunctionWithMeta } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type PlatformApiWithMeta<T> = {
  data: T;
  statusCode: number;
};

/** Body for `wp-proxy` executions: `{ siteId, handler, body? }`. */
export type WpProxyExecutionBody = {
  siteId: string;
  handler: string;
  body?: Record<string, unknown>;
};

/**
 * POST JSON to the `wp-proxy` Appwrite function. `_path` is ignored.
 *
 * Requires `{ siteId, handler, body? }` — `handler` like `plugins/update`, `themes/install`, `bridge/forceUpdate`.
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
