/**
 * Execution gateway: Appwrite functions should use execute permission `any`; caller identity is supplied
 * via `APPWRITE_FUNCTION_USER_ID` / `x-appwrite-user-id` (JWT/session). Authorization (admin labels,
 * team membership, invite tokens, etc.) is enforced inside handlers — not via Appwrite role-based execute scopes.
 */
declare function callerUserIdFromReq(req: any): string;
declare function getAuthUserId(req: any): string;
declare function userIsAdmin(users: any, _teams: any, userId: any, _log: any): Promise<any>;
export { callerUserIdFromReq, getAuthUserId, userIsAdmin };
