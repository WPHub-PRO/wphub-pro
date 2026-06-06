import { WPHUB_APPWRITE_IDS, Query } from '@code045/wphubpro-shared'

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function fetchPlatformAccountDoc(databases, userId) {
  if (!userId || !String(userId).trim()) return null;
  const dbId = process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
  const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;
  const found = await databases.listDocuments(dbId, accountsColl, [
    Query.equal('user_id', String(userId).trim()),
    Query.limit(1),
  ]);
  return found.documents?.[0] ? { ...found.documents[0] } : null;
}

export {
  fetchPlatformAccountDoc,
};