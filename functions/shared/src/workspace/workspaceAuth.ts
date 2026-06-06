/**
 * Canonical workspace session: platform `accounts` row, Appwrite memberships,
 * personal vs team mode (`active_team_id`), and switching active workspace.
 */

import * as sdk from 'node-appwrite';
import { WPHUB_APPWRITE_IDS, platformTeamsTableId } from '../appwrite/ids.ts';
import {
  listUserMemberships,
  userHasConfirmedMembershipInTeam,
  userIsOwnerRoleOnTeam,
  userIsMemberOnlyOnTeam,
} from './workspaceTeam.ts';
import { trimStr } from '../core/strings.ts';
import { appwriteDatabaseId } from '../core/env.ts';

function platformDatabaseId() {
  return String(appwriteDatabaseId() || '').trim();
}

function platformAccountsCollectionId() {
  return WPHUB_APPWRITE_IDS.platformTables.accounts;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function loadAccountByUserId(databases, userId) {
  const uid = trimStr(userId);
  if (!uid) return null;
  const found = await databases.listDocuments(platformDatabaseId(), platformAccountsCollectionId(), [
    sdk.Query.equal('user_id', uid),
    sdk.Query.limit(1),
  ]);
  return found.documents?.[0] ?? null;
}

/**
 * Legacy fallback when membership API lags: account marks this team as the active workspace.
 *
 * @param {Record<string, unknown> | null | undefined} acc
 * @param {string} requestedTeamId
 */
function accountActiveTeamMatchesTeam(acc, requestedTeamId) {
  if (!acc || typeof acc !== 'object') return false;
  const tid = trimStr(requestedTeamId);
  if (!tid) return false;
  return trimStr(acc.active_team_id) === tid;
}

/**
 * Workspace for creating/listing resources: personal vs team (`active_team_id` + Appwrite membership).
 *
 * @param {import('node-appwrite').Databases} databases
 * @param {string} sessionUserId
 * @param {import('node-appwrite').Users | null | undefined} users
 */
async function resolveWorkspaceAuthContext(databases, sessionUserId, users) {
  const authUserId = trimStr(sessionUserId);
  if (!authUserId) {
    return {
      authUserId: '',
      account: null,
      mode: 'personal',
      rowUserId: null,
      rowTeamId: null,
      memberships: [],
      activeTeamOwnerUserId: null,
      activeTeamIsMemberOnly: false,
    };
  }
  const account = await loadAccountByUserId(databases, authUserId);
  const activeTeam = trimStr(account?.active_team_id);
  const mems = users ? await listUserMemberships(users, authUserId) : [];

  let activeTeamOwnerUserId = null;
  let activeTeamIsMemberOnly = false;
  if (activeTeam && userHasConfirmedMembershipInTeam(mems, activeTeam, authUserId)) {
    try {
      const row = await databases.getDocument(platformDatabaseId(), platformTeamsTableId(), activeTeam);
      activeTeamOwnerUserId = trimStr(row.owner_id) || null;
    } catch {
      activeTeamOwnerUserId = null;
    }
    const isOwner =
      userIsOwnerRoleOnTeam(mems, activeTeam, authUserId) ||
      (activeTeamOwnerUserId && activeTeamOwnerUserId === authUserId);
    activeTeamIsMemberOnly = !isOwner && userIsMemberOnlyOnTeam(mems, activeTeam, authUserId);
  }

  let mode = 'personal';
  let rowTeamId = null;
  if (activeTeam && users && userHasConfirmedMembershipInTeam(mems, activeTeam, authUserId)) {
    mode = 'team';
    rowTeamId = activeTeam;
  }

  return {
    authUserId,
    account,
    mode,
    rowUserId: mode === 'team' ? null : authUserId,
    rowTeamId,
    memberships: mems,
    activeTeamOwnerUserId,
    activeTeamIsMemberOnly,
  };
}

/** @deprecated Use {@link resolveWorkspaceAuthContext}; same implementation. */
const resolveWorkspaceContext = resolveWorkspaceAuthContext;

/**
 * Align `accounts.active_team_id` with the target workspace when allowed. Idempotent (no write if unchanged).
 *
 * @param {object} p
 * @param {import('node-appwrite').Databases} p.databases
 * @param {import('node-appwrite').Users | null | undefined} p.users
 * @param {string} p.sessionUserId
 * @param {string | null | undefined} p.targetTeamId — empty/null = personal workspace
 * @returns {Promise<
 *   | { ok: true; switched: boolean; activeTeamId: string | null; account: Record<string, unknown> }
 *   | { ok: false; code: 'unauthorized' | 'no_account' | 'not_member'; message: string }
 * >}
 */
async function switchUserToWorkspaceIfNeeded(p) {
  const { databases, users, sessionUserId } = p;
  const actor = trimStr(sessionUserId);
  if (!actor) {
    return { ok: false, code: 'unauthorized', message: 'Missing session user id.' };
  }
  const raw = p.targetTeamId;
  const nextTeamId =
    raw === null || raw === undefined || trimStr(raw) === '' ? null : trimStr(String(raw));

  const acc = await loadAccountByUserId(databases, actor);
  if (!acc || !acc.$id) {
    return { ok: false, code: 'no_account', message: 'Account document not found.' };
  }

  const current = trimStr(acc.active_team_id) || null;

  if (!nextTeamId) {
    if (!current) {
      return { ok: true, switched: false, activeTeamId: null, account: acc };
    }
    await databases.updateDocument(platformDatabaseId(), platformAccountsCollectionId(), String(acc.$id), {
      active_team_id: null,
    });
    const refreshed = await loadAccountByUserId(databases, actor);
    return { ok: true, switched: true, activeTeamId: null, account: refreshed || { ...acc, active_team_id: null } };
  }

  const mems = users ? await listUserMemberships(users, actor) : [];
  if (!userHasConfirmedMembershipInTeam(mems, nextTeamId, actor)) {
    return { ok: false, code: 'not_member', message: 'Not a member of this team.' };
  }

  if (current === nextTeamId) {
    return { ok: true, switched: false, activeTeamId: nextTeamId, account: acc };
  }

  await databases.updateDocument(platformDatabaseId(), platformAccountsCollectionId(), String(acc.$id), {
    active_team_id: nextTeamId,
  });
  const refreshed = await loadAccountByUserId(databases, actor);
  return { ok: true, switched: true, activeTeamId: nextTeamId, account: refreshed || { ...acc, active_team_id: nextTeamId } };
}

export {
  loadAccountByUserId,
  resolveWorkspaceAuthContext,
  resolveWorkspaceContext,
  switchUserToWorkspaceIfNeeded,
  accountActiveTeamMatchesTeam,
  platformDatabaseId,
  platformAccountsCollectionId,
};
