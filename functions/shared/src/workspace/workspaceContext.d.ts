/**
 * Session-based access checks on site documents (consumes workspace auth context from `workspaceAuth`).
 */
import { loadAccountByUserId } from './workspaceAuth.ts';
/**
 * @param {Awaited<ReturnType<typeof resolveWorkspaceAuthContext>>} ctx
 * @param {Record<string, unknown>} siteDoc
 * @param {import('node-appwrite').Users | null | undefined} users
 */
declare function sessionCanAccessSiteDocument(ctx: any, siteDoc: any, users: any): boolean;
/**
 * @param {Awaited<ReturnType<typeof resolveWorkspaceAuthContext>>} ctx
 * @param {Record<string, unknown>} siteDoc
 * @param {import('node-appwrite').Users | null | undefined} users
 */
declare function sessionCanMutateSiteDocument(ctx: any, siteDoc: any, users: any): any;
/**
 * @deprecated Prefer resolveWorkspaceAuthContext + sessionCanAccessSiteDocument for new code.
 * Back-compat for handlers still comparing `resourceOwnerUserId` to `siteDoc.user_id`.
 *
 * @returns {Promise<{ resourceOwnerUserId: string; teamId: string | null; mode: string; rowTeamId: string | null; account: Record<string, unknown> | null }>}
 */
declare function resolveResourceOwnerUserId(databases: any, sessionUserId: any, users: any): Promise<{
    resourceOwnerUserId: string;
    teamId: any;
    mode: string;
    rowTeamId: any;
    account: any;
}>;
export { loadAccountByUserId, sessionCanAccessSiteDocument, sessionCanMutateSiteDocument, resolveResourceOwnerUserId, };
