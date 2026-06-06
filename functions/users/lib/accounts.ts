import { Query } from '@code045/wphubpro-shared';

/**
 * Load at most one accounts row per user id (parallel listDocuments).
 */
async function fetchAccountsByUserIds(databases, dbId, accountsColl, userIds) {
  const map = Object.create(null);
  if (!userIds.length) return map;
  const results = await Promise.all(
    userIds.map((uid) =>
      databases.listDocuments(dbId, accountsColl, [Query.equal("user_id", uid), Query.limit(1)]),
    ),
  );
  userIds.forEach((uid, i) => {
    const doc = results[i].documents?.[0];
    map[uid] = doc || null;
  });
  return map;
}

export { fetchAccountsByUserIds };
