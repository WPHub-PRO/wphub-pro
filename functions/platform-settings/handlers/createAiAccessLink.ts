import { ok, fail } from '@code045/wphubpro-shared';
import { upsertSettingByKey } from '../lib/settingsStore.ts';
import {
  generateAccessToken,
  normalizeTtlMinutes,
  storageKeyForToken,
} from '../lib/aiAccessTokens.ts';

function normalizeOrigin(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export default async function handleCreateAiAccessLink({
  res,
  error,
  databases,
  users,
  payload,
  actorUserId,
}) {
  const ttlMinutes = normalizeTtlMinutes(payload.ttlMinutes ?? payload.ttl_minutes);
  const label = String(payload.label || '').trim().slice(0, 120);
  const origin = normalizeOrigin(payload.origin ?? payload.baseUrl ?? payload.base_url);

  if (!origin) {
    return fail(res, 'Missing or invalid origin (pass window.location.origin).', 400);
  }

  let actorEmail = '';
  try {
    const actor = await users.get(actorUserId);
    actorEmail = String(actor?.email || '').trim();
  } catch (e) {
    error('[create_ai_access_link] actor lookup: ' + (e instanceof Error ? e.message : String(e)));
  }

  const token = generateAccessToken();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlMinutes * 60_000);

  const record = {
    userId: actorUserId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false,
    ...(label ? { label } : {}),
    ...(actorEmail ? { createdByEmail: actorEmail } : {}),
  };

  try {
    await upsertSettingByKey(databases, storageKeyForToken(token), record);
  } catch (e) {
    error('[create_ai_access_link] store: ' + (e instanceof Error ? e.message : String(e)));
    return fail(res, 'Could not store access link.', 500);
  }

  const path = '/auth/ai-access';
  const url = `${origin}${path}?token=${encodeURIComponent(token)}`;

  return ok(res, {
    success: true,
    url,
    expiresAt: expiresAt.toISOString(),
    ttlMinutes,
    ...(label ? { label } : {}),
  });
}
