/** Event keys that should notify every member when `teamId` is set. */
export declare const TEAM_SCOPED_FANOUT_EVENT_KEYS: Set<string>;
/**
 * @param {import('node-appwrite').Teams | null | undefined} teams
 * @param {string} teamId
 * @returns {Promise<string[]>}
 */
export declare function teamMemberUserIds(teams: any, teamId: any): Promise<any[]>;
/**
 * @param {string} eventKeyNorm
 * @param {string | null} teamId
 */
export declare function shouldFanOutTeamNotification(eventKeyNorm: any, teamId: any): boolean;
