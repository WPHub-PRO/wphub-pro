import { ok, fail, loadPlatformEvent, platformEventsColl, platformEventsDatabaseId, Query, ID } from '@code045/wphubpro-shared'

const VALID_CATEGORIES = new Set([
  'platform',
  'site',
  'billing',
  'workspace',
  'account',
  'library',
  'team',
  'subscription',
]);
const VALID_SEVERITY = new Set(['info', 'warning', 'high_risk']);

async function handlePlatformEventsList(ctx) {
  if (!ctx.isAdmin) return fail(ctx.res, 'Forbidden', 403);
  const dbId = platformEventsDatabaseId();
  const coll = platformEventsColl();
  const list = await ctx.databases.listDocuments(dbId, coll, [
    Query.orderAsc('event_key'),
    Query.limit(200),
  ]);
  return ok(ctx.res, { success: true, events: list.documents || [] });
}

async function handlePlatformEventsUpsert(ctx) {
  if (!ctx.isAdmin) return fail(ctx.res, 'Forbidden', 403);
  const p = ctx.payload || {};
  const eventKey = String(p.event_key || p.eventKey || '')
    .trim()
    .toLowerCase();
  if (!eventKey) return fail(ctx.res, 'event_key required', 400);

  const category = String(p.category || 'platform').trim().toLowerCase();
  const severity = String(p.severity || 'info').trim().toLowerCase();
  if (!VALID_CATEGORIES.has(category)) return fail(ctx.res, 'Invalid category', 400);
  if (!VALID_SEVERITY.has(severity)) return fail(ctx.res, 'Invalid severity', 400);

  const title = String(p.title || eventKey).slice(0, 256);
  const notificationTitle = String(p.notification_title || p.notificationTitle || '').slice(0, 512);
  const notificationBody = String(p.notification_body || p.notificationBody || '').slice(0, 10000);
  const data = {
    event_key: eventKey,
    title,
    category,
    severity,
    notification_enabled: p.notification_enabled !== false && p.notificationEnabled !== false,
    notification_title: notificationTitle,
    notification_body: notificationBody,
    email_enabled: p.email_enabled === true || p.emailEnabled === true,
    email_template_key: String(p.email_template_key || p.emailTemplateKey || eventKey).slice(0, 128),
  };

  const dbId = platformEventsDatabaseId();
  const coll = platformEventsColl();
  const existing = await ctx.databases.listDocuments(dbId, coll, [
    Query.equal('event_key', eventKey),
    Query.limit(1),
  ]);
  const doc = existing.documents?.[0];
  if (doc) {
    const updated = await ctx.databases.updateDocument(dbId, coll, doc.$id, data);
    return ok(ctx.res, { success: true, event: updated });
  }
  const created = await ctx.databases.createDocument(dbId, coll, ID.unique(), data);
  return ok(ctx.res, { success: true, event: created });
}

export default { handlePlatformEventsList, handlePlatformEventsUpsert };