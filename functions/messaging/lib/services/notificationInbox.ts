import { inboxByUserIdQueries } from '@code045/wphubpro-shared';
import {
  parseRetentionCutoffMs,
  inboxItemVisibleInPrefs,
  parseTopbarNotificationPrefs,
  topbarAllowsDoc,
  workspaceAllowsDoc,
} from '../notificationInboxPrefs.ts';
import { DATABASE_ID, NOTIFICATIONS_ID } from '../constants.ts';

async function loadRetentionCutoffMs(users, actorUserId) {
  try {
    const u = await users.get(actorUserId);
    const prefs = u.prefs && typeof u.prefs === 'object' ? u.prefs : {};
    return { cutoffMs: parseRetentionCutoffMs(prefs), prefs };
  } catch {
    return { cutoffMs: null, prefs: {} };
  }
}

function eventKeyFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'string') return '';
  try {
    const o = JSON.parse(metadata);
    return typeof o.event_key === 'string' ? o.event_key.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

function categoryFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'string') return 'platform';
  try {
    const o = JSON.parse(metadata);
    return typeof o.category === 'string' ? o.category.trim().toLowerCase() : 'platform';
  } catch {
    return 'platform';
  }
}

function passesRetention(createdAt, cutoffMs) {
  if (cutoffMs == null) return true;
  const t = Date.parse(String(createdAt || ''));
  if (!Number.isFinite(t)) return true;
  return t >= cutoffMs;
}

function mapDocToItem(doc) {
  const ek = doc.event_key || eventKeyFromMetadata(doc.metadata || '');
  const cat = categoryFromMetadata(doc.metadata || '');
  return {
    id: doc.$id,
    createdAt: doc.$createdAt,
    type: cat,
    eventKey: ek,
    title: doc.title,
    body: doc.body || '',
    metadata: doc.metadata || null,
    isBroadcast: false,
    readAt: null,
    teamId: doc.team_id ? String(doc.team_id) : null,
    broadcastAudience: 'none',
  };
}

/**
 * @param {{ databases: import('node-appwrite').Databases; users?: import('node-appwrite').Users; actorUserId: string; payload: Record<string, unknown> }} ctx
 */
async function listUnread(ctx) {
  const { databases, users, actorUserId, payload } = ctx;
  const limit = Math.min(120, Math.max(1, Number(payload?.limit) || 40));
  const fetchCap = Math.min(250, Math.max(limit * 3, 80));
  const scopeRaw = String(payload?.scope || payload?.listScope || 'topbar')
    .trim()
    .toLowerCase();
  const scope = scopeRaw === 'workspace' ? 'workspace' : 'topbar';
  const activeTeamIdRaw = payload?.activeTeamId;
  const activeTeamId =
    activeTeamIdRaw === null || activeTeamIdRaw === undefined
      ? null
      : String(activeTeamIdRaw).trim() || null;

  const retention = users ? await loadRetentionCutoffMs(users, actorUserId) : { cutoffMs: null, prefs: {} };
  const retentionCutoffMs = retention.cutoffMs;
  const prefs = retention.prefs;
  const topbarParsed = parseTopbarNotificationPrefs(prefs);

  const list = await databases.listDocuments(
    DATABASE_ID,
    NOTIFICATIONS_ID,
    inboxByUserIdQueries(actorUserId, fetchCap),
  );

  const candidates = [];
  for (const d of list.documents || []) {
    if (!passesRetention(d.$createdAt, retentionCutoffMs)) continue;
    const ek = d.event_key || eventKeyFromMetadata(d.metadata || '');
    const cat = categoryFromMetadata(d.metadata || '');
    if (!inboxItemVisibleInPrefs(prefs, { type: cat, eventKey: ek })) continue;
    const item = mapDocToItem(d);
    if (scope === 'workspace') {
      if (!workspaceAllowsDoc(d, activeTeamId)) continue;
    } else if (!topbarAllowsDoc(topbarParsed, d)) continue;
    candidates.push(item);
  }

  candidates.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { items: candidates.slice(0, limit), unreadCount: candidates.length };
}

/**
 * @param {{ databases: import('node-appwrite').Databases; actorUserId: string; notificationId: string }} p
 */
async function markRead(p) {
  const { databases, actorUserId, notificationId } = p;
  let doc;
  try {
    doc = await databases.getDocument(DATABASE_ID, NOTIFICATIONS_ID, notificationId);
  } catch {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  const owner = doc.user_id != null ? String(doc.user_id).trim() : '';
  if (owner !== String(actorUserId).trim()) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
  await databases.deleteDocument(DATABASE_ID, NOTIFICATIONS_ID, doc.$id);
}

export { listUnread, markRead };