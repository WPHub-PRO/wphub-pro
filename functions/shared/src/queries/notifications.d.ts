/**
 * @param {string} userId
 * @param {number} limit
 */
export declare function inboxByUserIdQueries(userId: any, limit?: number): string[];
/**
 * @param {string} userId
 * @param {string} userIdAttr
 * @param {number} [limit]
 */
export declare function notificationReadRowsByUserQueries(userId: any, userIdAttr: any, limit?: number): string[];
/**
 * @param {string[]} notificationIds
 * @param {number} [limit]
 */
export declare function notificationReadRowsByNotificationIdsQueries(notificationIds: any, limit?: number): string[];
