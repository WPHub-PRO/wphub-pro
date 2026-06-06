import { trimStr } from '../core/strings.ts';

const MAX_TEAM_NOTIFICATION_RECIPIENTS = 500;

/** Event keys that should notify every member when `teamId` is set. */
export const TEAM_SCOPED_FANOUT_EVENT_KEYS = new Set([
  'plugin_update_available',
  'theme_update_available',
  'bridge_plugin_update_available',
  'site_health_issue',
  'site_uptime_down',
  'site_uptime_up',
  'site_connection_issue',
]);

/**
 * @param {import('node-appwrite').Teams | null | undefined} teams
 * @param {string} teamId
 * @returns {Promise<string[]>}
 */
export async function teamMemberUserIds(teams, teamId) {
  const tid = trimStr(teamId);
  if (!tid || !teams || typeof teams.listMemberships !== 'function') return [];
  try {
    const memList = await teams.listMemberships({ teamId: tid });
    const out = [];
    for (const m of memList.memberships || []) {
      const uidRaw = m && (m.userId != null ? m.userId : m.user_id);
      const uid = uidRaw != null ? String(uidRaw).trim() : '';
      if (uid) out.push(uid);
    }
    return [...new Set(out)].slice(0, MAX_TEAM_NOTIFICATION_RECIPIENTS);
  } catch {
    return [];
  }
}

/**
 * @param {string} eventKeyNorm
 * @param {string | null} teamId
 */
export function shouldFanOutTeamNotification(eventKeyNorm, teamId) {
  const ek = String(eventKeyNorm || '')
    .trim()
    .toLowerCase();
  const tid = trimStr(teamId);
  return Boolean(tid) && TEAM_SCOPED_FANOUT_EVENT_KEYS.has(ek);
}
