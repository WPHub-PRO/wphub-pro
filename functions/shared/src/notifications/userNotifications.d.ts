/**
 * Create one in-app notification row per recipient (via platform event).
 * @param {import('node-appwrite').Databases} databases
 * @param {{
 *   recipientUserIds?: string[] | unknown;
 *   recipientUserId?: string;
 *   type?: string;
 *   eventKey?: string;
 *   title?: string;
 *   body?: string;
 *   metadata?: unknown;
 *   createdByUserId?: string | null;
 *   users?: import('node-appwrite').Users;
 *   teams?: import('node-appwrite').Teams | null;
 *   eventKey?: string;
 *   teamId?: string | null;
 *   skipPreferenceCheck?: boolean;
 * }} p
 * @returns {Promise<string | null>} first created document id or null
 */
declare function createUserNotification(databases: any, p: any): Promise<string>;
/** @deprecated Admin broadcast removed — use automated platform events only. */
declare function createBroadcastNotification(): Promise<void>;
export { DATABASE_ID, NOTIFICATIONS_ID } from '../platform/emitPlatformEvent.ts';
export { createUserNotification, createBroadcastNotification, };
