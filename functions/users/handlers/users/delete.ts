import {WPHUB_APPWRITE_IDS, Query, Users} from '@code045/wphubpro-shared';

export default async function handleDelete({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const userId = payload.userId || payload.user_id;
  if (!userId) {
    return res.json({ success: false, message: "userId required" }, 400);
  }

  const { client, databases } = ctx;
  const users = new Users(client);
  const dbId =
    process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
  const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;

  try {
    const found = await databases.listDocuments(dbId, accountsColl, [
      Query.equal("user_id", userId),
      Query.limit(1),
    ]);
    const doc = found.documents?.[0];
    if (doc) {
      await databases.deleteDocument(dbId, accountsColl, doc.$id);
      log(`users: deleted accounts row ${doc.$id} for user ${userId}`);
    }
    await users.delete(userId);
    log(`users: deleted user ${userId}`);
    return res.json({ success: true, deletedUserId: userId });
  } catch (err) {
    error(`handleDelete: ${err.message}`);
    return res.json({ success: false, message: err.message || "delete failed" }, 400);
  }
};
