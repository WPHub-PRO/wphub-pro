import { fetchAccountsByUserIds } from '../../lib/accounts.ts';
import {WPHUB_APPWRITE_IDS, Users} from '@code045/wphubpro-shared';

export default async function handleGet({ req, res, log, error }, ctx) {
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
    const user = await users.get(userId);
    const accMap = await fetchAccountsByUserIds(databases, dbId, accountsColl, [userId]);
    const account = accMap[userId] || null;
    return res.json({ success: true, user, account });
  } catch (err) {
    error(`handleGet: ${err.message}`);
    return res.json({ success: false, message: err.message || "get failed" }, 400);
  }
};
