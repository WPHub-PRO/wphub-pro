/**
 * @param {Record<string, unknown>} payload
 * @returns {string} origin without trailing slash
 */
export default function resolveInviteAppOrigin(payload) {
  const base = String(payload.inviteBaseUrl ?? payload.invite_base_url ?? '').trim();
  if (base.startsWith('http')) {
    try {
      return new URL(base).origin;
    } catch {
      /* fall through */
    }
  }
  const u = String(payload.inviteUrl ?? payload.invite_url ?? '').trim();
  if (u.startsWith('http')) {
    try {
      return new URL(u).origin;
    } catch {
      return '';
    }
  }
  return '';
};
