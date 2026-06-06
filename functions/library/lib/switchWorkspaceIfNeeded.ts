/**
 * Align `accounts.active_team_id` with the target workspace when allowed (idempotent).
 */
import {WPHUB_APPWRITE_IDS, listUserMemberships, userHasConfirmedMembershipInTeam, Query, Databases, Users, Teams} from '@code045/wphubpro-shared'

function dbId(): string {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function accountsColl(): string {
  return WPHUB_APPWRITE_IDS.platformTables.accounts;
}

async function loadAccountByUserId(
  databases: Databases,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const found = await databases.listDocuments(dbId(), accountsColl(), [
    Query.equal('user_id', uid),
    Query.limit(1),
  ]);
  return (found.documents?.[0] as Record<string, unknown>) ?? null;
}

export type SwitchWorkspaceResult =
  | { ok: true; switched: boolean; activeTeamId: string | null; account: Record<string, unknown> }
  | { ok: false; code: string; message: string };

export async function switchUserToWorkspaceIfNeeded(p: {
  databases: Databases;
  users: Users | null | undefined;
  teams: Teams | null | undefined;
  sessionUserId: string;
  targetTeamId: string | null | undefined;
}): Promise<SwitchWorkspaceResult> {
  const { databases, users, teams, sessionUserId, targetTeamId } = p;
  const actor = String(sessionUserId || '').trim();
  if (!actor) {
    return { ok: false, code: 'unauthorized', message: 'Missing session user id.' };
  }
  const nextTeamId =
    targetTeamId === null || targetTeamId === undefined || String(targetTeamId).trim() === ''
      ? null
      : String(targetTeamId).trim();

  const acc = await loadAccountByUserId(databases, actor);
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
    const refreshed = await loadAccountByUserId(databases, actor);
    return {
      ok: true,
      switched: true,
      activeTeamId: null,
      account: refreshed || { ...acc, active_team_id: null },
    };
  }

  const mems = users ? await listUserMemberships(users, actor) : [];
  if (!userHasConfirmedMembershipInTeam(mems, nextTeamId, actor)) {
    return { ok: false, code: 'not_member', message: 'Not a member of this team.' };
  }

  if (teams && typeof teams.listMemberships === 'function') {
    const memList = await teams.listMemberships({
      teamId: nextTeamId,
      queries: [Query.equal('userId', actor)],
    });
    if (!memList.memberships || memList.memberships.length === 0) {
      return { ok: false, code: 'not_member', message: 'Not a member of this team.' };
    }
  }

  if (current === nextTeamId) {
    return { ok: true, switched: false, activeTeamId: nextTeamId, account: acc };
  }

  await databases.updateDocument(dbId(), accountsColl(), String(acc.$id), {
    active_team_id: nextTeamId,
  });
  const refreshed = await loadAccountByUserId(databases, actor);
  return {
    ok: true,
    switched: true,
    activeTeamId: nextTeamId,
    account: refreshed || { ...acc, active_team_id: nextTeamId },
  };
}
