/**
 * In-app notification preference gate (shared by userNotifications / all functions).
 * List/topbar/workspace filtering lives in the messaging function (`notificationInboxPrefs.js`).
 * Keep event keys in sync with `wphubpro/src/domains/notifications/prefDefinitions.ts`.
 */
declare const NOTIFICATION_PREF_ITEMS: {
    key: string;
    label: string;
    group: string;
}[];
declare const PREF_KEY_SET: Set<string>;
/**
 * @param {import('node-appwrite').Users} users
 * @param {string} userId
 * @param {{ eventKey?: string; type?: string }} channel
 * @returns {Promise<boolean>}
 */
declare function userWantsInAppNotification(users: any, userId: any, channel: any): Promise<boolean>;
export { NOTIFICATION_PREF_ITEMS, PREF_KEY_SET, userWantsInAppNotification };
