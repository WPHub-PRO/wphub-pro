const MAX_RECIPIENTS = 500;

/**
 * @param {unknown} val
 * @returns {string[]}
 */
function coerceStringArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return [];
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fall through */
    }
    return [s];
  }
  return [];
}

/**
 * Unread recipient user ids on a notifications row (supports legacy `recipient_user_id`).
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {string[]}
 */
export function normalizeRecipientsUserIds(doc) {
  if (!doc) return [];
  const fromArray = coerceStringArray(doc.recipients_user_id);
  if (fromArray.length > 0) return [...new Set(fromArray)].slice(0, MAX_RECIPIENTS);
  const readAt = doc.read_at != null ? String(doc.read_at).trim() : '';
  if (readAt) return [];
  const legacy = doc.recipient_user_id != null ? String(doc.recipient_user_id).trim() : '';
  return legacy ? [legacy] : [];
}

/**
 * @param {Record<string, unknown> | null | undefined} doc
 * @param {string} userId
 */
export function userHasUnreadRecipient(doc, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  return normalizeRecipientsUserIds(doc).includes(uid);
}

/**
 * @param {string[]} ids
 * @param {string} userId
 * @returns {string[]}
 */
export function removeRecipientUserId(ids, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [...ids];
  return ids.filter((id) => String(id) !== uid);
}

/**
 * @param {unknown} recipientUserIds
 * @param {string} [recipientUserId]
 * @returns {string[]}
 */
export function resolveRecipientUserIds(recipientUserIds, recipientUserId) {
  const fromArray = coerceStringArray(recipientUserIds);
  const single = recipientUserId != null ? String(recipientUserId).trim() : '';
  const merged = single ? [...fromArray, single] : fromArray;
  return [...new Set(merged)].slice(0, MAX_RECIPIENTS);
}

export { MAX_RECIPIENTS as MAX_NOTIFICATION_RECIPIENTS };
