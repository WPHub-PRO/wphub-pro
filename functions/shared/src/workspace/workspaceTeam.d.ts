/**
 * Appwrite Teams membership helpers (no `accounts.team_id` / `account_kind`).
 * Used by `users`, `sites`, and `library` functions for workspace + access checks.
 */
/**
 * Same hub rule as `functions/users/handlers/teamsList.js`.
 * @param {Record<string, unknown>} m
 * @param {string} actor
 */
declare function membershipCountsForHub(m: any, actor: any): any;
/**
 * @param {import('node-appwrite').Users} users
 * @param {string} userId
 * @returns {Promise<Record<string, unknown>[]>}
 */
declare function listUserMemberships(users: any, userId: any): Promise<any>;
/**
 * @param {Record<string, unknown>[]} memberships
 * @param {string} teamId
 * @param {string} viewerUserId
 */
declare function userHasConfirmedMembershipInTeam(memberships: any, teamId: any, viewerUserId: any): boolean;
/**
 * @param {Record<string, unknown>[]} memberships
 * @param {string} teamId
 * @param {string} userId
 */
declare function userIsOwnerRoleOnTeam(memberships: any, teamId: any, userId: any): any;
/**
 * Member (non-owner) on this team with a usable membership row.
 * @param {Record<string, unknown>[]} memberships
 * @param {string} teamId
 * @param {string} userId
 */
declare function userIsMemberOnlyOnTeam(memberships: any, teamId: any, userId: any): boolean;
export { membershipCountsForHub, listUserMemberships, userHasConfirmedMembershipInTeam, userIsOwnerRoleOnTeam, userIsMemberOnlyOnTeam, };
