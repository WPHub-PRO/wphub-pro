declare const MAX_RECIPIENTS = 500;
/**
 * Unread recipient user ids on a notifications row (supports legacy `recipient_user_id`).
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {string[]}
 */
export declare function normalizeRecipientsUserIds(doc: any): any[];
/**
 * @param {Record<string, unknown> | null | undefined} doc
 * @param {string} userId
 */
export declare function userHasUnreadRecipient(doc: any, userId: any): boolean;
/**
 * @param {string[]} ids
 * @param {string} userId
 * @returns {string[]}
 */
export declare function removeRecipientUserId(ids: any, userId: any): any;
/**
 * @param {unknown} recipientUserIds
 * @param {string} [recipientUserId]
 * @returns {string[]}
 */
export declare function resolveRecipientUserIds(recipientUserIds: any, recipientUserId: any): any[];
export { MAX_RECIPIENTS as MAX_NOTIFICATION_RECIPIENTS };
