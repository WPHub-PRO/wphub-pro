import { readUserIdFromDoc } from '../notificationReadsUserField.ts';
import {
  Query,
  inboxByUserIdQueries,
  notificationReadRowsByUserQueries,
  notificationReadRowsByNotificationIdsQueries,
} from '@code045/wphubpro-shared';

function directUnreadQueries(userId, limit) {
  return inboxByUserIdQueries(userId, limit);
}

function legacyDirectUnreadQueries(userId, limit) {
  return [
    Query.equal('recipient_user_id', userId),
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
  ];
}

function broadcastListQueries(limit) {
  return [Query.equal('broadcast', true), Query.orderDesc('$createdAt'), Query.limit(limit)];
}
import { DATABASE_ID, NOTIFICATIONS_ID, NOTIFICATION_READS_ID } from '../constants.ts';
import { USER_ID_ATTR } from '../notificationReadsUserField.ts';

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} actorUserId
 * @param {number} fetchCap
 */
async function listDirectUnreadDocs(databases, actorUserId, fetchCap) {
  const [directRes, legacyDirectRes] = await Promise.all([
    databases.listDocuments(
      DATABASE_ID,
      NOTIFICATIONS_ID,
      directUnreadQueries(actorUserId, fetchCap),
    ),
    databases.listDocuments(DATABASE_ID, NOTIFICATIONS_ID, legacyDirectUnreadQueries(actorUserId, fetchCap)).catch(
      (e) => {
        const msg = String(e && e.message ? e.message : e);
        if (/Attribute not found|Invalid query|not found in schema/i.test(msg)) {
          return { documents: [] };
        }
        throw e;
      },
    ),
  ]);
  const directById = new Map();
  for (const d of [...(directRes.documents || []), ...(legacyDirectRes.documents || [])]) {
    directById.set(d.$id, d);
  }
  return [...directById.values()];
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {number} fetchCap
 */
async function listBroadcastDocs(databases, fetchCap) {
  const broadcastRes = await databases.listDocuments(
    DATABASE_ID,
    NOTIFICATIONS_ID,
    broadcastListQueries(fetchCap),
  );
  return broadcastRes.documents || [];
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} actorUserId
 * @param {string[]} broadcastIds
 */
async function listNotificationReadRows(databases, actorUserId, broadcastIds) {
  if (broadcastIds.length === 0) {
    return { documents: [] };
  }
  const byUser = () =>
    databases.listDocuments(
      DATABASE_ID,
      NOTIFICATION_READS_ID,
      notificationReadRowsByUserQueries(actorUserId, USER_ID_ATTR),
    );
  const byNotification = () =>
    databases.listDocuments(
      DATABASE_ID,
      NOTIFICATION_READS_ID,
      notificationReadRowsByNotificationIdsQueries(broadcastIds),
    );
  try {
    return await byUser();
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (!/Attribute not found|Invalid query|not found in schema/i.test(msg)) {
      throw e;
    }
    const res = await byNotification();
    res.documents = (res.documents || []).filter((d) => readUserIdFromDoc(d) === String(actorUserId));
    return res;
  }
}

export {
  listDirectUnreadDocs,
  listBroadcastDocs,
  listNotificationReadRows,
};
