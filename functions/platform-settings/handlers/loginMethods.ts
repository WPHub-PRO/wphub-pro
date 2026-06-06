import { ok, fail, Query } from '@code045/wphubpro-shared'
import { getSettingValueByKey, boolFromRecord } from '../lib/settingsStore.ts';

export default async function handleLoginMethods({ res, log, error, databases, users, payload }) {
  const email = String(payload.email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    return fail(res, 'Missing email', 400);
  }
  try {
    const auth = await getSettingValueByKey(databases, 'auth');
    const mfaFactorEmailEnabled = boolFromRecord(auth, 'mfaOtpMailEnabled', true);
    const mfaFactorAuthenticatorEnabled = boolFromRecord(auth, 'mfaAuthenticatorEnabled', true);

    let mfaFactorEmailRegistered = null;
    let mfaFactorTotpRegistered = null;

    const userList = await users.list([Query.equal('email', email), Query.limit(1)]);
    const rowUsers = userList.users || userList.documents;
    if (userList.total > 0 && rowUsers && rowUsers[0]) {
      const userId = rowUsers[0].$id;
      try {
        let factors = null;
        if (typeof users.listMFAFactors === 'function') {
          factors = await users.listMFAFactors({ userId });
        } else if (typeof users.listMfaFactors === 'function') {
          factors = await users.listMfaFactors({ userId });
        }
        if (factors && typeof factors === 'object') {
          if (typeof factors.email === 'boolean') mfaFactorEmailRegistered = factors.email;
          if (typeof factors.totp === 'boolean') mfaFactorTotpRegistered = factors.totp;
        }
      } catch (e1) {
        log('listMFAFactors failed (non-fatal): ' + e1.message);
      }
    }

    return ok(res, {
      mfaFactorEmailEnabled,
      mfaFactorAuthenticatorEnabled,
      mfaFactorEmailRegistered,
      mfaFactorTotpRegistered,
    });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
