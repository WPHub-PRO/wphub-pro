/**
 * `notification_reads` user column (see root `appwrite.config.json` / `wphubpro/appwrite/platform_db.notification_reads.schema.json`).
 * If the live table was created with another key, set the function env `NOTIFICATION_READS_USER_FIELD`
 * to that key (e.g. `reader_user_id`); must match a column in the table schema.
 */
const USER_ID_ATTR = (process.env.NOTIFICATION_READS_USER_FIELD || 'user_id').trim();

/**
 * @param {Record<string, unknown> | null | undefined} doc
 * @returns {string}
 */
function readUserIdFromDoc(doc) {
  if (!doc) return ''
  return String(
    doc[USER_ID_ATTR] !== undefined
      ? doc[USER_ID_ATTR]
      : doc.user_id !== undefined
        ? doc.user_id
        : doc.userId !== undefined
          ? doc.userId
          : doc.reader_user_id !== undefined
            ? doc.reader_user_id
            : '',
  );
}

/** @param {string} userId */
function buildUserIdPayload(userId) {
  return { [USER_ID_ATTR]: userId }
}

export {
  USER_ID_ATTR,
  readUserIdFromDoc,
  buildUserIdPayload,
};