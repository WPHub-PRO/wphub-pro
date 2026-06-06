import { WPHUB_APPWRITE_IDS, platformTeamsTableId, listUserMemberships, userHasConfirmedMembershipInTeam, userIsOwnerRoleOnTeam, userIsMemberOnlyOnTeam, membershipCountsForHub, Query } from '@code045/wphubpro-shared';

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function accountsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.accounts;
}

/**
 * Platform `accounts` row by `user_id` (same query as `functions-lib` `loadAccountByUserId`).
 * Kept local so `users` works when `functions-lib` is an older GitHub build without that export.
 *
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 */
async function getAccountByUserId(databases, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const found = await databases.listDocuments(dbId(), accountsColl(), [
    Query.equal('user_id', uid),
    Query.limit(1),
  ]);
  return found.documents?.[0] ? { ...found.documents[0] } : null;
}

/**
 * Workspace role for UI / billing, derived from Appwrite memberships + optional platform `teams` row.
 * Does not read removed `accounts.account_kind` / `accounts.team_id`.
 *
 * @param {import('node-appwrite').Users} users
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @param {Record<string, unknown> | null} acc
 * @param {string} [contextTeamId] explicit team (e.g. from payload); falls back to `active_team_id`
 */
async function workspaceRoleForUser(users, databases, userId, acc, contextTeamId) {
  const uid = String(userId || '').trim();
  if (!uid || !users) return 'individual';
  const tid = String(contextTeamId || acc?.active_team_id || '').trim();
  if (!tid) return 'individual';
  const mems = await listUserMemberships(users, uid);
  if (!userHasConfirmedMembershipInTeam(mems, tid, uid)) return 'individual';
  if (userIsOwnerRoleOnTeam(mems, tid, uid)) return 'team_owner';
  try {
    const row = await databases.getDocument(dbId(), platformTeamsTableId(), tid);
    if (String(row.owner_id || '').trim() === uid) return 'team_owner';
  } catch {
    /* no row */
  }
  if (userIsMemberOnlyOnTeam(mems, tid, uid)) return 'team_member';
  return 'individual';
}

/**
 * First team where the user has owner membership and `teams.owner_id` matches.
 * @param {import('node-appwrite').Users} users
 * @param {import('node-appwrite').Databases} databases
 * @param {string} actor
 */
async function firstOwnedPlatformTeamId(users, databases, actor) {
  const uid = String(actor || '').trim();
  if (!uid || !users) return '';
  const mems = await listUserMemberships(users, uid);
  const tColl = platformTeamsTableId();
  for (const m of mems) {
    if (!membershipCountsForHub(m, uid)) continue;
    const tid = String(m.teamId || '').trim();
    if (!tid) continue;
    const roles = (m.roles || []).map((r) => String(r).toLowerCase());
    if (!roles.includes('owner')) continue;
    try {
      const row = await databases.getDocument(dbId(), tColl, tid);
      if (String(row.owner_id || '').trim() === uid) return tid;
    } catch {
      /* ignore */
    }
  }
  return '';
}

/**
 * @param {import('node-appwrite').Teams} teams
 * @param {string} teamId
 * @param {string} userId
 */
async function userHasTeamOwnerRole(teams, teamId, userId) {
  const list = await teams.listMemberships({ teamId, queries: [Query.equal('userId', userId)] });
  const m = list.memberships?.[0];
  if (!m) return false;
  const roles = Array.isArray(m.roles) ? m.roles : [];
  return roles.map((r) => String(r).toLowerCase()).includes('owner');
}

/**
 * Align `accounts.active_team_id` with the target workspace when allowed (idempotent).
 * Local copy so `users` works when published `functions-lib` omits this helper.
 *
 * @param {object} p
 * @param {import('node-appwrite').Databases} p.databases
 * @param {import('node-appwrite').Users | null | undefined} p.users
 * @param {string} p.sessionUserId
 * @param {string | null | undefined} p.targetTeamId
 * @returns {Promise<
 *   | { ok: true; switched: boolean; activeTeamId: string | null; account: Record<string, unknown> }
 *   | { ok: false; code: 'unauthorized' | 'no_account' | 'not_member'; message: string }
 * >}
 */
async function switchUserToWorkspaceIfNeeded(p) {
  const { databases, users, sessionUserId, targetTeamId } = p;
  const actor = String(sessionUserId || '').trim();
  if (!actor) {
    return { ok: false, code: 'unauthorized', message: 'Missing session user id.' };
  }
  const nextTeamId =
    targetTeamId === null || targetTeamId === undefined || String(targetTeamId).trim() === ''
      ? null
      : String(targetTeamId).trim();

  const acc = await getAccountByUserId(databases, actor);
  if (!acc || !acc.$id) {
    return { ok: false, code: 'no_account', message: 'Account document not found.' };
  }

  const current = String(acc.active_team_id || '').trim() || null;

  if (!nextTeamId) {
    if (!current) {
      return { ok: true, switched: false, activeTeamId: null, account: acc };
    }
    await databases.updateDocument(dbId(), accountsColl(), String(acc.$id), {
      active_team_id: null,
    });
    const refreshed = await getAccountByUserId(databases, actor);
    return { ok: true, switched: true, activeTeamId: null, account: refreshed || { ...acc, active_team_id: null } };
  }

  const mems = users ? await listUserMemberships(users, actor) : [];
  if (!userHasConfirmedMembershipInTeam(mems, nextTeamId, actor)) {
    return { ok: false, code: 'not_member', message: 'Not a member of this team.' };
  }

  if (current === nextTeamId) {
    return { ok: true, switched: false, activeTeamId: nextTeamId, account: acc };
  }

  await databases.updateDocument(dbId(), accountsColl(), String(acc.$id), {
    active_team_id: nextTeamId,
  });
  const refreshed = await getAccountByUserId(databases, actor);
  return { ok: true, switched: true, activeTeamId: nextTeamId, account: refreshed || { ...acc, active_team_id: nextTeamId } };
}

export {
  dbId,
  accountsColl,
  getAccountByUserId,
  workspaceRoleForUser,
  firstOwnedPlatformTeamId,
  userHasTeamOwnerRole,
  switchUserToWorkspaceIfNeeded,
};
