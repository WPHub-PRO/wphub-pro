import { ok, fail } from '@code045/wphubpro-shared';
import { listGlobalApiEnv } from '../lib/globalFunctionEnvVars.ts';

export default async function handleListApiEnv({ res, log, error, databases, client, actorUserId }) {
  try {
    log(`platform-settings list_api_env for admin ${actorUserId}`);
    const data = await listGlobalApiEnv({ client, databases });
    return ok(res, { success: true, ...data });
  } catch (e) {
    error(`[platform-settings] list_api_env: ${e.message}`);
    return fail(res, e.message || 'Could not list project global variables.', 500);
  }
};
