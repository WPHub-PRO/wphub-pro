import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey } from '../lib/settingsStore.ts';

export default async function handlePublicBranding({ res, error, databases }) {
  try {
    const b = await getSettingValueByKey(databases, 'platform_branding');
    const s = (k) => (b && typeof b[k] === 'string' ? b[k].trim() : '');
    return ok(res, {
      platformTitle: s('platformTitle'),
      platformSlogan: s('platformSlogan'),
      logoUrlLight: s('logoUrlLight'),
      logoUrlDark: s('logoUrlDark'),
      iconUrlLight: s('iconUrlLight'),
      iconUrlDark: s('iconUrlDark'),
    });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
