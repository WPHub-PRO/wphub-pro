import { Query } from 'node-appwrite';

/**
 * @param {string} userId
 * @param {number} limit
 */
export function inboxByUserIdQueries(userId, limit = 120) {
  return [
    Query.equal('user_id', userId),
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
  ];
}

/**
 * @param {string} userId
 * @param {string} userIdAttr
 * @param {number} [limit]
 */
export function notificationReadRowsByUserQueries(userId, userIdAttr, limit = 500) {
  return [Query.equal(userIdAttr, userId), Query.limit(limit)];
}

/**
 * @param {string[]} notificationIds
 * @param {number} [limit]
 */
export function notificationReadRowsByNotificationIdsQueries(notificationIds, limit = 2000) {
  return [Query.equal('notification_id', notificationIds), Query.limit(limit)];
}
