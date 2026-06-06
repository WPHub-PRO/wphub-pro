/**
 * Appwrite Teams membership helpers (no `accounts.team_id` / `account_kind`).
 * Used by `users`, `sites`, and `library` functions for workspace + access checks.
 */

import { trimStr } from '../core/strings.ts';

/**
 * Same hub rule as `functions/users/handlers/teamsList.js`.
 * @param {Record<string, unknown>} m
 * @param {string} actor
 */
function membershipCountsForHub(m, actor) {
  if (m.confirmed === true || m.joined === true) return true;
  if (String(m.userId || '').trim() !== String(actor || '').trim()) return false;
  const roles = (m.roles || []).map((r) => String(r).toLowerCase());
  // Same-user row: count non–fully-confirmed owners *and* members so teams-list / set-active-team
  // match team-get (which also allows `accounts.active_team_id` when membership flags lag).
  return (
    roles.includes('owner') ||
    roles.includes('member') ||
    roles.includes('admin') ||
    roles.includes('editor')
  );
}

/**
 * @param {import('node-appwrite').Users} users
 * @param {string} userId
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function listUserMemberships(users, userId) {
  const uid = trimStr(userId);
  if (!uid || !users || typeof users.listMemberships !== 'function') return [];
  const list = await users.listMemberships({ userId: uid });
  return list.memberships || [];
}

/**
 * @param {Record<string, unknown>[]} memberships
 * @param {string} teamId
 * @param {string} viewerUserId
 */
function userHasConfirmedMembershipInTeam(memberships, teamId, viewerUserId) {
  const tid = trimStr(teamId);
  const vid = trimStr(viewerUserId);
  if (!tid || !vid) return false;
  for (const m of memberships || []) {
    if (trimStr(m.teamId) !== tid) continue;
    if (membershipCountsForHub(m, vid)) return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>[]} memberships
 * @param {string} teamId
 * @param {string} userId
 */
function userIsOwnerRoleOnTeam(memberships, teamId, userId) {
  const tid = trimStr(teamId);
  const uid = trimStr(userId);
  if (!tid || !uid) return false;
  for (const m of memberships || []) {
    if (trimStr(m.teamId) !== tid) continue;
    if (trimStr(m.userId) !== uid) continue;
    const roles = (m.roles || []).map((r) => String(r).toLowerCase());
    if (roles.includes('owner')) return membershipCountsForHub(m, uid);
  }
  return false;
}

/**
 * Member (non-owner) on this team with a usable membership row.
 * @param {Record<string, unknown>[]} memberships
 * @param {string} teamId
 * @param {string} userId
 */
function userIsMemberOnlyOnTeam(memberships, teamId, userId) {
  const tid = trimStr(teamId);
  const uid = trimStr(userId);
  if (!tid || !uid) return false;
  if (userIsOwnerRoleOnTeam(memberships, teamId, userId)) return false;
  for (const m of memberships || []) {
    if (trimStr(m.teamId) !== tid) continue;
    if (trimStr(m.userId) !== uid) continue;
    const roles = (m.roles || []).map((r) => String(r).toLowerCase());
    if (roles.includes('member') && membershipCountsForHub(m, uid)) return true;
  }
  return false;
}

export {
  membershipCountsForHub,
  listUserMemberships,
  userHasConfirmedMembershipInTeam,
  userIsOwnerRoleOnTeam,
  userIsMemberOnlyOnTeam,
};
