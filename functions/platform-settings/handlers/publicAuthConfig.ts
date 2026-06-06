import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey, boolFromRecord } from '../lib/settingsStore.ts';

export default async function handlePublicAuthConfig({ res, error, databases }) {
  try {
    const auth = await getSettingValueByKey(databases, 'auth');
    return ok(res, {
      forceMfaForAllUsers: boolFromRecord(auth, 'forceMfaForAllUsers', false),
      mfaOtpMailEnabled: boolFromRecord(auth, 'mfaOtpMailEnabled', true),
      mfaAuthenticatorEnabled: boolFromRecord(auth, 'mfaAuthenticatorEnabled', true),
    });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
