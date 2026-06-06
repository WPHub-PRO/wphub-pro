import { callerUserIdFromReq, userIsAdmin, WPHUB_APPWRITE_IDS, Query, ID } from '@code045/wphubpro-shared';

/**
 * Idempotent: create `accounts` row for user_id if missing (API key bypasses team-only create rule).
 */
export default async function handleEnsureAccount({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: "Unauthorized: could not resolve caller user" }, 401);
  }

  const targetUserId = String(payload.userId || payload.user_id || actor).trim();
  if (!targetUserId) {
    return res.json({ success: false, message: "userId required" }, 400);
  }

  const { databases, users, teams } = ctx;
  const dbId =
    process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
  const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;

  if (targetUserId !== actor) {
    const admin = await userIsAdmin(users, teams, actor, log);
    if (!admin) {
      return res.json({ success: false, message: "Forbidden: can only create own account row unless admin" }, 403);
    }
  }

  try {
    const existing = await databases.listDocuments(dbId, accountsColl, [
      Query.equal("user_id", targetUserId),
      Query.limit(1),
    ]);
    const doc = existing.documents?.[0];
    if (doc) {
      return res.json({ success: true, account: doc, created: false });
    }

    const created = await databases.createDocument(dbId, accountsColl, ID.unique(), {
      user_id: targetUserId,
    });
    log(`users: created accounts row for ${targetUserId}`);
    return res.json({ success: true, account: created, created: true });
  } catch (err) {
    error(`ensureAccount: ${err.message}`);
    return res.json({ success: false, message: err.message || "ensureAccount failed" }, 400);
  }
};
