/**
 * Canonical workspace session: platform `accounts` row, Appwrite memberships,
 * personal vs team mode (`active_team_id`), and switching active workspace.
 */
declare function platformDatabaseId(): string;
declare function platformAccountsCollectionId(): string;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
declare function loadAccountByUserId(databases: any, userId: any): Promise<any>;
/**
 * Legacy fallback when membership API lags: account marks this team as the active workspace.
 *
 * @param {Record<string, unknown> | null | undefined} acc
 * @param {string} requestedTeamId
 */
declare function accountActiveTeamMatchesTeam(acc: any, requestedTeamId: any): boolean;
/**
 * Workspace for creating/listing resources: personal vs team (`active_team_id` + Appwrite membership).
 *
 * @param {import('node-appwrite').Databases} databases
 * @param {string} sessionUserId
 * @param {import('node-appwrite').Users | null | undefined} users
 */
declare function resolveWorkspaceAuthContext(databases: any, sessionUserId: any, users: any): Promise<{
    authUserId: string;
    account: any;
    mode: string;
    rowUserId: string;
    rowTeamId: any;
    memberships: any;
    activeTeamOwnerUserId: any;
    activeTeamIsMemberOnly: boolean;
}>;
/** @deprecated Use {@link resolveWorkspaceAuthContext}; same implementation. */
declare const resolveWorkspaceContext: typeof resolveWorkspaceAuthContext;
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
declare function switchUserToWorkspaceIfNeeded(p: any): Promise<{
    ok: boolean;
    code: string;
    message: string;
    switched?: undefined;
    activeTeamId?: undefined;
    account?: undefined;
} | {
    ok: boolean;
    switched: boolean;
    activeTeamId: string;
    account: any;
    code?: undefined;
    message?: undefined;
}>;
export { loadAccountByUserId, resolveWorkspaceAuthContext, resolveWorkspaceContext, switchUserToWorkspaceIfNeeded, accountActiveTeamMatchesTeam, platformDatabaseId, platformAccountsCollectionId, };
