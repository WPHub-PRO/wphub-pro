import { ok, fail } from '@code045/wphubpro-shared';
import { getSettingValueByKey, upsertSettingByKey } from '../lib/settingsStore.ts';
import { storageKeyForToken } from '../lib/aiAccessTokens.ts';

const APPWRITE_TOKEN_EXPIRE_SEC = 900;

async function createLoginSecret(users, userId: string, log: (msg: string) => void): Promise<string> {
  if (typeof users.createSession === 'function') {
    try {
      const session = await users.createSession({ userId });
      const secret = String(session?.secret || '').trim();
      if (secret) {
        log('[redeem_ai_access_link] session via users.createSession');
        return secret;
      }
    } catch (e) {
      log(
        '[redeem_ai_access_link] users.createSession fallback to createToken: ' +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  if (typeof users.createToken !== 'function') {
    throw new Error('Session login is not available in this runtime.');
  }

  const appwriteToken = await users.createToken({
    userId,
    expire: APPWRITE_TOKEN_EXPIRE_SEC,
  });
  const secret = String(appwriteToken?.secret || '').trim();
  if (!secret) {
    throw new Error('Could not create login secret.');
  }
  log('[redeem_ai_access_link] session via users.createToken');
  return secret;
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

  let secret: string;
  try {
    secret = await createLoginSecret(users, userId, log);
  } catch (e) {
    error('[redeem_ai_access_link] create login secret: ' + (e instanceof Error ? e.message : String(e)));
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
