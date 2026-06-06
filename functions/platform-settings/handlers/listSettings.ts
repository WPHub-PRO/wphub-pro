import { ok, fail } from '@code045/wphubpro-shared';
import { listAllSettingsItems } from '../lib/settingsStore.ts';

export default async function handleListSettings({ res, log, error, databases, actorUserId }) {
  try {
    log('platform-settings get/list for admin ' + actorUserId);
    const items = await listAllSettingsItems(databases);
    return ok(res, { success: true, items });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
