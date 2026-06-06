import {WPHUB_APPWRITE_IDS, Query, Users} from '@code045/wphubpro-shared';

/**
 * Admin: apply user updates via Appwrite Users API + optional `accounts` doc for Stripe id.
 * Payload: { userId, updates: { name?, email?, status?, isAdmin?, stripe_customer_id? } }
 */
export default async function handleUpdate({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const userId = payload.userId || payload.user_id;
  const updates = payload.updates && typeof payload.updates === "object" ? payload.updates : {};

  if (!userId) {
    return res.json({ success: false, message: "userId required" }, 400);
  }

  const { client, databases } = ctx;
  const users = new Users(client);
  const dbId =
    process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
  const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;

  try {
    let user = await users.get(userId);

    if (updates.name !== undefined && updates.name !== null) {
      await users.updateName(userId, String(updates.name));
      log(`users: updated name for ${userId}`);
    }

    if (updates.email !== undefined && updates.email !== null) {
      await users.updateEmail(userId, String(updates.email));
      log(`users: updated email for ${userId}`);
    }

    if (updates.status !== undefined) {
      const s = updates.status;
      const isActive =
        s === true ||
        s === "Active" ||
        s === "active" ||
        (typeof s === "string" && s.toLowerCase() === "active");
      await users.updateStatus(userId, Boolean(isActive));
      log(`users: updated status (active=${isActive}) for ${userId}`);
    }

    if (updates.isAdmin !== undefined) {
      const wantAdmin = Boolean(updates.isAdmin);
      const labels = Array.isArray(user.labels) ? [...user.labels] : [];
      const withoutAdmin = labels.filter((l) => String(l).toLowerCase() !== "admin");
      const newLabels = wantAdmin ? [...withoutAdmin, "admin"] : withoutAdmin;
      await users.updateLabels(userId, newLabels);
      log(`users: updated labels (admin=${wantAdmin}) for ${userId}`);
    }

    if (updates.stripe_customer_id !== undefined && databases) {
      try {
        const found = await databases.listDocuments(dbId, accountsColl, [
          Query.equal("user_id", userId),
          Query.limit(1),
        ]);
        const doc = found.documents?.[0];
        if (doc) {
          await databases.updateDocument(dbId, accountsColl, doc.$id, {
            stripe_customer_id: updates.stripe_customer_id || null,
          });
          log(`users: updated stripe_customer_id on accounts for ${userId}`);
        } else {
          log(`users: no accounts row for ${userId}; skipping stripe_customer_id`);
        }
      } catch (accErr) {
        error(`users: accounts update failed: ${accErr.message}`);
        return res.json(
          { success: false, message: `User updated but accounts failed: ${accErr.message}` },
          400,
        );
      }
    }

    user = await users.get(userId);
    return res.json({ success: true, user });
  } catch (err) {
    error(`handleUpdate: ${err.message}`);
    return res.json({ success: false, message: err.message || "Update failed" }, 400);
  }
};
