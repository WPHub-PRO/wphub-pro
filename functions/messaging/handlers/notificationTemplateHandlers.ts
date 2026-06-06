import { ok, fail, WPHUB_APPWRITE_IDS, sendUserNotificationFromTemplate, NOTIFICATION_TEMPLATE_EVENT_KEYS, Query, ID } from '@code045/wphubpro-shared'

function templatesColl() {
  return WPHUB_APPWRITE_IDS.platformTables.notificationTemplates;
}

function db() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

async function handleNotificationTemplatesList(ctx) {
  const { res, databases, isAdmin } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const list = await databases.listDocuments(db(), templatesColl(), [Query.limit(200)]);
  const items = (list.documents || []).map((d) => ({
    $id: d.$id,
    event_key: d.event_key,
    title_template: d.title_template,
    body_template: d.body_template ?? '',
    enabled: d.enabled !== false,
    updatedAt: d.$updatedAt ?? d.$UpdatedAt ?? null,
  }));
  return ok(res, { success: true, items });
}

async function handleNotificationTemplatesUpsert(ctx) {
  const { res, databases, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const event_key = String(payload?.event_key || '').trim().toLowerCase();
  const title_template = String(payload?.title_template || '').trim().slice(0, 512);
  const body_template = String(payload?.body_template ?? '').slice(0, 10000);
  const enabled = payload?.enabled === false ? false : true;
  if (!event_key) return fail(res, 'event_key is required', 400);
  if (!NOTIFICATION_TEMPLATE_EVENT_KEYS.has(event_key)) {
    return fail(res, 'Invalid event_key.', 400);
  }
  if (!title_template) return fail(res, 'title_template is required', 400);

  const existing = await databases.listDocuments(db(), templatesColl(), [
    Query.equal('event_key', event_key),
    Query.limit(1),
  ]);
  const docId = payload?.documentId ? String(payload.documentId).trim() : '';
  if (existing.total && existing.documents[0]) {
    await databases.updateDocument(db(), templatesColl(), existing.documents[0].$id, {
      title_template,
      body_template,
      enabled,
    });
    return ok(res, { success: true, documentId: existing.documents[0].$id });
  }
  if (docId) {
    await databases.updateDocument(db(), templatesColl(), docId, {
      event_key,
      title_template,
      body_template,
      enabled,
    });
    return ok(res, { success: true, documentId: docId });
  }
  const created = await databases.createDocument(db(), templatesColl(), ID.unique(), {
    event_key,
    title_template,
    body_template,
    enabled,
  });
  return ok(res, { success: true, documentId: created.$id });
}

/**
 * Internal (secret) or admin: render template → in-app notification row.
 */
async function handleNotificationSendFromTemplate(ctx) {
  const { res, databases, isAdmin, payload, actorUserId, internalTemplateSend } = ctx;
  const allowed = Boolean(internalTemplateSend) || isAdmin;
  if (!allowed) return fail(res, 'Forbidden: admin or internal secret required', 403);

  const event_key = String(payload?.event_key || '').trim().toLowerCase();
  if (!NOTIFICATION_TEMPLATE_EVENT_KEYS.has(event_key)) {
    return fail(res, 'Invalid event_key.', 400);
  }
  const recipient_user_id = String(
    payload?.recipient_user_id || payload?.recipientUserId || '',
  ).trim();
  const data =
    payload?.payload && typeof payload.payload === 'object' ? payload.payload : payload?.metadata;

  const teamId =
    payload?.team_id != null && String(payload.team_id).trim()
      ? String(payload.team_id).trim()
      : payload?.teamId != null && String(payload.teamId).trim()
        ? String(payload.teamId).trim()
        : null;

  const result = await sendUserNotificationFromTemplate(databases, {
    eventKey: event_key,
    recipientUserId: recipient_user_id,
    payload: data && typeof data === 'object' && !Array.isArray(data) ? data : {},
    createdByUserId: isAdmin && !internalTemplateSend && actorUserId ? actorUserId : null,
    users: ctx.users,
    teams: ctx.teams,
    teamId,
  });

  if (!result.ok) {
    const msg = result.skipped || result.reason || 'send_failed';
    return fail(res, msg, 400);
  }
  return ok(res, { success: true });
}

export default {
  handleNotificationTemplatesList,
  handleNotificationTemplatesUpsert,
  handleNotificationSendFromTemplate,
};