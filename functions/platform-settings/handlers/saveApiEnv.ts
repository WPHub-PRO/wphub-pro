import { ok, fail } from '@code045/wphubpro-shared';
import { saveGlobalApiEnv } from '../lib/globalFunctionEnvVars.ts';

export default async function handleSaveApiEnv({ res, log, error, databases, client, payload, actorUserId }) {
  const entries = payload.entries ?? payload.variables ?? payload.items;
  if (!Array.isArray(entries)) {
    return fail(res, 'entries array is required (each item: { key, value }).', 400);
  }

  try {
    log(`platform-settings save_api_env for admin ${actorUserId} (${entries.length} rows)`);
    const result = await saveGlobalApiEnv({ client, databases, entries });
    return ok(res, {
      success: true,
      message: `Saved ${result.saved} global variable(s) on the Appwrite project.`,
      ...result,
    });
  } catch (e) {
    error(`[platform-settings] save_api_env: ${e.message}`);
    return fail(res, e.message || 'Could not save project global variables.', 500);
  }
};
