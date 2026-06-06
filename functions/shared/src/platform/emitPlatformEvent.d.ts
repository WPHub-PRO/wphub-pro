declare const DATABASE_ID: string;
declare const NOTIFICATIONS_ID: string;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @param {string | null} teamId
 * @param {string} eventKey
 * @param {string} title
 * @param {string} body
 * @param {string} metadata
 */
declare function createNotificationRow(databases: any, userId: any, teamId: any, eventKey: any, title: any, body: any, metadata: any): Promise<any>;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{ users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams | null }} clients
 * @param {{
 *   eventKey: string;
 *   payload?: Record<string, unknown> | null;
 *   userId?: string;
 *   teamId?: string | null;
 *   recipientUserId?: string;
 *   recipientUserIds?: string[];
 *   createdByUserId?: string | null;
 *   skipPreferenceCheck?: boolean;
 * }} p
 */
export declare function emitPlatformEvent(databases: any, clients: any, p: any): Promise<{
    ok: boolean;
    reason: string;
    skipped?: undefined;
    recipientCount?: undefined;
} | {
    ok: boolean;
    skipped: string;
    reason: string;
    recipientCount?: undefined;
} | {
    ok: boolean;
    skipped: string;
    reason?: undefined;
    recipientCount?: undefined;
} | {
    ok: boolean;
    recipientCount: number;
    reason?: undefined;
    skipped?: undefined;
}>;
export { createNotificationRow, DATABASE_ID, NOTIFICATIONS_ID };
