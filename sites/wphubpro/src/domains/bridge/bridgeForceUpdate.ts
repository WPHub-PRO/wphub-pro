import { executeFunctionWithMeta } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type StartBridgeForceUpdateResult = {
  executionId?: string;
  status?: string;
};

/**
 * Admin: start async `wp-proxy` `bridge_force_update` / `bridge/forceUpdate` (all sites, batched on the server).
 * Does not wait for per-site results.
 */
export async function startBridgeForceUpdateAllSites(): Promise<StartBridgeForceUpdateResult> {
  const { data } = await executeFunctionWithMeta<StartBridgeForceUpdateResult & { success?: boolean }>(
    APPWRITE_FUNCTION_IDS.WP_PROXY,
    { handler: 'bridge_force_update' },
    {
      asyncStartOnly: true,
      omitImpersonationHeaders: true,
      throwOnHttpError: true,
      parseJson: true,
    },
  );
  return { executionId: data?.executionId, status: data?.status };
}
