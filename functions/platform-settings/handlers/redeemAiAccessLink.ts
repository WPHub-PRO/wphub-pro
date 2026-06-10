import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey, upsertSettingByKey } from '../lib/settingsStore.ts';
import { storageKeyForToken } from '../lib/aiAccessTokens.ts';

const APPWRITE_TOKEN_EXPIRE_SEC = 900;

export default async function handleRedeemAiAccessLink({ res, error, databases, users, payload }) {
  const token = String(payload.token || payload.t || '').trim();
  if (!token) {
    return fail(res, 'Missing token.', 400);
  }

  const key = storageKeyForToken(token);
  let record: Record<string, unknown>;
  try {
    record = (await getSettingValueByKey(databases, key)) as Record<string, unknown>;
  } catch (e) {
    error('[redeem_ai_access_link] load: ' + (e instanceof Error ? e.message : String(e)));
    return fail(res, 'Could not validate access link.', 500);
  }

  if (!record || typeof record !== 'object' || !record.userId) {
    return fail(res, 'Access link is invalid or has expired.', 404);
  }

  if (record.used === true) {
    return fail(res, 'Access link has already been used.', 410);
  }

  const expiresAtMs = Date.parse(String(record.expiresAt || ''));
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
    return fail(res, 'Access link has expired.', 410);
  }

  const userId = String(record.userId).trim();
  if (!userId) {
    return fail(res, 'Access link is invalid.', 400);
  }

  try {
    await users.get(userId);
  } catch {
    return fail(res, 'Access link is no longer valid.', 410);
  }

  if (typeof users.createToken !== 'function') {
    return fail(res, 'Token login is not available in this runtime.', 500);
  }

  let appwriteToken;
  try {
    appwriteToken = await users.createToken({
      userId,
      expire: APPWRITE_TOKEN_EXPIRE_SEC,
    });
  } catch (e) {
    error('[redeem_ai_access_link] createToken: ' + (e instanceof Error ? e.message : String(e)));
    return fail(res, 'Could not start session for this link.', 500);
  }

  const secret = String(appwriteToken?.secret || '').trim();
  if (!secret) {
    return fail(res, 'Could not start session for this link.', 500);
  }

  try {
    await upsertSettingByKey(databases, key, {
      ...record,
      used: true,
      usedAt: new Date().toISOString(),
    });
  } catch (e) {
    error('[redeem_ai_access_link] mark used: ' + (e instanceof Error ? e.message : String(e)));
    return fail(res, 'Could not finalize access link.', 500);
  }

  return ok(res, {
    success: true,
    userId,
    secret,
    sessionTokenExpiresInSec: APPWRITE_TOKEN_EXPIRE_SEC,
  });
}
