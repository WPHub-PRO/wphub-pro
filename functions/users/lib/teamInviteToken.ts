import * as crypto from 'node:crypto';

function inviteSecret() {
  return String(process.env.WPHUB_TEAM_INVITE_SECRET || '').trim();
}

/**
 * Single UTC ISO string for HMAC so signing matches verify after Appwrite datetime round-trip
 * (stored value often differs from `new Date().toISOString()` byte-for-byte).
 * @param {unknown} raw — Date, ISO string, or Appwrite datetime string
 * @returns {string}
 */
function canonicalExpiresForSigning(raw) {
  if (raw == null || raw === '') return '';
  try {
    const d = raw instanceof Date ? raw : new Date(typeof raw === 'string' ? raw.trim() : raw);
    const t = d.getTime();
    if (!Number.isFinite(t)) {
      return typeof raw === 'string' ? raw.trim() : '';
    }
    return new Date(t).toISOString();
  } catch {
    return typeof raw === 'string' ? raw.trim() : '';
  }
}

/**
 * @param {Record<string, unknown>} doc team_invites document
 * @returns {string}
 */
function canonicalExpiresIso(doc) {
  return canonicalExpiresForSigning(doc && doc.expires_at);
}

/**
 * @param {{ inviteId: string; email: string; teamId: string; expiresAtIso?: string; expires_at?: unknown }} p
 * @returns {string} hex HMAC
 */
function signTeamInviteToken(p) {
  const secret = inviteSecret();
  if (!secret) {
    throw new Error('WPHUB_TEAM_INVITE_SECRET is not configured on the users function');
  }
  const email = String(p.email || '')
    .trim()
    .toLowerCase();
  const teamId = String(p.teamId || '').trim();
  const inviteId = String(p.inviteId || '').trim();
  const exp = canonicalExpiresForSigning(p.expiresAtIso ?? p.expires_at);
  const payload = `${inviteId}|${email}|${teamId}|${exp}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} token
 * @returns {boolean}
 */
function verifyTeamInviteToken(doc, token) {
  if (!inviteSecret() || !doc) return false;
  const got = String(token || '').trim();
  if (!got || got.length < 32) return false;
  const secret = inviteSecret();
  const inviteId = String(doc.$id || '').trim();
  const email = String(doc.email || '')
    .trim()
    .toLowerCase();
  const teamId = String(doc.team_id || '').trim();
  /** Same instant, different string representations after Appwrite storage / legacy signing. */
  const expVariants = new Set();
  const canon = canonicalExpiresForSigning(doc.expires_at);
  if (canon) expVariants.add(canon);
  const raw =
    typeof doc.expires_at === 'string'
      ? doc.expires_at.trim()
      : String(doc.expires_at != null ? doc.expires_at : '').trim();
  if (raw) expVariants.add(raw);

  for (const exp of expVariants) {
    let expected;
    try {
      const payload = `${inviteId}|${email}|${teamId}|${exp}`;
      expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    } catch {
      continue;
    }
    if (got.length !== expected.length) continue;
    try {
      if (crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'))) {
        return true;
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

export {
  inviteSecret,
  signTeamInviteToken,
  verifyTeamInviteToken,
  canonicalExpiresIso,
  canonicalExpiresForSigning,
};
