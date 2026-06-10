import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey, upsertSettingByKey } from '../lib/settingsStore.ts';
import { storageKeyForToken } from '../lib/aiAccessTokens.ts';

/** Appwrite custom-token secret length (hex); must be 1–256 chars for account.createSession. */
const LOGIN_TOKEN_LENGTH = 64;
const LOGIN_TOKEN_EXPIRE_SEC = 900;

function readTokenSecret(tokenResponse: unknown): string {
  if (!tokenResponse || typeof tokenResponse !== 'object') return '';
  const row = tokenResponse as Record<string, unknown>;
  return String(row.secret ?? row.Secret ?? '').trim();
}

export default async function handleRedeemAiAccessLink({ res, error, log, databases, users, payload }) {
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

  let secret = '';
  try {
    const tokenResponse = await users.createToken({
      userId,
      length: LOGIN_TOKEN_LENGTH,
      expire: LOGIN_TOKEN_EXPIRE_SEC,
    });
    secret = readTokenSecret(tokenResponse);
    log(`[redeem_ai_access_link] createToken secret length=${secret.length}`);
  } catch (e) {
    error('[redeem_ai_access_link] createToken: ' + (e instanceof Error ? e.message : String(e)));
    return fail(res, 'Could not start session for this link.', 500);
  }

  if (!secret || secret.length > 256) {
    error('[redeem_ai_access_link] invalid token secret length=' + String(secret.length));
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
    sessionTokenExpiresInSec: LOGIN_TOKEN_EXPIRE_SEC,
  });
}
