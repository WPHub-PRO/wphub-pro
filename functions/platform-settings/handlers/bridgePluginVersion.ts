import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey } from '../lib/settingsStore.ts';

export default async function handleBridgePluginVersion({ res, log, error, databases, actorUserId }) {
  try {
    const b = await getSettingValueByKey(databases, 'bridge_plugin');
    let version = null;
    if (b && typeof b === 'object' && typeof b.version === 'string') {
      const t = b.version.trim();
      version = t.length ? t : null;
    }
    log('platform-settings bridge_plugin_version for user ' + actorUserId);
    return ok(res, { success: true, version });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
