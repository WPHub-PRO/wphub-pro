/**
 * Session-based access checks on site documents (consumes workspace auth context from `workspaceAuth`).
 */

import {
  userHasConfirmedMembershipInTeam,
  userIsOwnerRoleOnTeam,
} from './workspaceTeam.ts';
import { trimStr } from '../core/strings.ts';
import { resolveWorkspaceAuthContext, loadAccountByUserId } from './workspaceAuth.ts';

/**
 * @param {Awaited<ReturnType<typeof resolveWorkspaceAuthContext>>} ctx
 * @param {Record<string, unknown>} siteDoc
 * @param {import('node-appwrite').Users | null | undefined} users
 */
function sessionCanAccessSiteDocument(ctx, siteDoc, users) {
  if (!ctx.authUserId) return false;
  const docT = trimStr(siteDoc.team_id);
  const docU = trimStr(siteDoc.user_id ?? siteDoc.userId);
  if (docT) {
    if (!users) return false;
    return userHasConfirmedMembershipInTeam(ctx.memberships, docT, ctx.authUserId);
  }
  if (!docU) return false;
  if (docU === ctx.authUserId) return true;
  if (ctx.activeTeamIsMemberOnly && ctx.activeTeamOwnerUserId && docU === ctx.activeTeamOwnerUserId) return true;
  return false;
}

/**
 * @param {Awaited<ReturnType<typeof resolveWorkspaceAuthContext>>} ctx
 * @param {Record<string, unknown>} siteDoc
 * @param {import('node-appwrite').Users | null | undefined} users
 */
function sessionCanMutateSiteDocument(ctx, siteDoc, users) {
  if (!sessionCanAccessSiteDocument(ctx, siteDoc, users)) return false;
  const docT = trimStr(siteDoc.team_id);
  if (docT) {
    return userIsOwnerRoleOnTeam(ctx.memberships, docT, ctx.authUserId);
  }
  const docU = trimStr(siteDoc.user_id ?? siteDoc.userId);
  if (docU === ctx.authUserId) return true;
  if (ctx.activeTeamIsMemberOnly && ctx.activeTeamOwnerUserId && docU === ctx.activeTeamOwnerUserId) return true;
  return false;
}

/**
 * @deprecated Prefer resolveWorkspaceAuthContext + sessionCanAccessSiteDocument for new code.
 * Back-compat for handlers still comparing `resourceOwnerUserId` to `siteDoc.user_id`.
 *
 * @returns {Promise<{ resourceOwnerUserId: string; teamId: string | null; mode: string; rowTeamId: string | null; account: Record<string, unknown> | null }>}
 */
async function resolveResourceOwnerUserId(databases, sessionUserId, users) {
  const ctx = await resolveWorkspaceAuthContext(databases, sessionUserId, users);
  const acc = ctx.account;
  let resourceOwnerUserId = ctx.authUserId;
  if (ctx.activeTeamIsMemberOnly && trimStr(ctx.activeTeamOwnerUserId)) {
    resourceOwnerUserId = trimStr(ctx.activeTeamOwnerUserId);
  }
  const teamId = ctx.mode === 'team' && ctx.rowTeamId ? ctx.rowTeamId : null;
  return {
    resourceOwnerUserId,
    teamId,
    mode: ctx.mode,
    rowTeamId: ctx.rowTeamId,
    account: acc,
  };
}

export {
  loadAccountByUserId,
  sessionCanAccessSiteDocument,
  sessionCanMutateSiteDocument,
  resolveResourceOwnerUserId,
};
