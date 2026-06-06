import * as sdk from 'node-appwrite';
import { WPHUB_APPWRITE_IDS } from '../appwrite/ids.ts';
import { appwriteDatabaseId } from '../core/env.ts';
import { userWantsInAppNotification } from '../notifications/notificationPrefs.ts';
import {
  shouldFanOutTeamNotification,
  teamMemberUserIds,
} from '../notifications/teamNotificationRecipients.ts';
import { substitutePlaceholders } from './templateSubstitute.ts';
import { loadPlatformEvent } from './loadPlatformEvent.ts';

const DATABASE_ID = appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
const NOTIFICATIONS_ID = WPHUB_APPWRITE_IDS.platformTables.notifications;

function coercePayload(payload: unknown): Record<string, unknown> {
  if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v != null && typeof v !== 'function') out[k] = v;
    }
    return out;
  }
  return {};
}

function buildActionMetadata(eventKeyNorm, merged) {
  if (eventKeyNorm !== 'team_invite_existing_user') return null;
  const inviteId = String(merged.invite_id || merged.inviteId || '').trim();
  const token = String(merged.invite_token || merged.token || '').trim();
  if (!inviteId || !token) return null;
  const teamId = String(merged.team_id || merged.teamId || '').trim();
  const teamName = String(merged.team_name || '').trim();
  const acceptLabel = String(merged.accept_cta || merged.accept_label || 'Accept invitation').trim();
  const declineLabel = String(merged.decline_cta || merged.decline_label || 'Decline invitation').trim();
  return {
    kind: 'team_invite',
    invite_id: inviteId,
    invite_token: token,
    team_id: teamId || null,
    team_name: teamName || null,
    actions: [
      { action: 'accept_team_invite', label: acceptLabel || 'Accept invitation', style: 'primary' },
      { action: 'decline_team_invite', label: declineLabel || 'Decline invitation', style: 'secondary' },
    ],
  };
}

function cleanMetadata(meta) {
  if (meta == null) return '';
  const s = typeof meta === 'string' ? meta : JSON.stringify(meta);
  return s.slice(0, 10000);
}

function renderNotificationCopy(event, merged) {
  const titleOverride = merged.title != null ? String(merged.title).trim() : '';
  const bodyOverride = merged.body != null ? String(merged.body).trim() : '';
  const title = titleOverride
    ? titleOverride.slice(0, 256)
    : substitutePlaceholders(event.notification_title, merged).slice(0, 256);
  const body = bodyOverride
    ? bodyOverride.slice(0, 10000)
    : substitutePlaceholders(event.notification_body, merged).slice(0, 10000);
  return { title, body };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @param {string | null} teamId
 * @param {string} eventKey
 * @param {string} title
 * @param {string} body
 * @param {string} metadata
 */
async function createNotificationRow(databases, userId, teamId, eventKey, title, body, metadata) {
  if (!title.trim()) return null;
  const doc = await databases.createDocument(DATABASE_ID, NOTIFICATIONS_ID, sdk.ID.unique(), {
    user_id: String(userId).trim(),
    team_id: teamId != null && String(teamId).trim() ? String(teamId).trim().slice(0, 64) : null,
    event_key: eventKey,
    title: title.slice(0, 256),
    body: body.slice(0, 10000),
    metadata,
  });
  return doc.$id;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{ users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams | null }} clients
 * @param {{
 *   eventKey: string;
 *   payload?: Record<string, unknown> | null;
 *   userId?: string;
 *   teamId?: string | null;
 *   recipientUserId?: string;
 *   recipientUserIds?: string[];
 *   createdByUserId?: string | null;
 *   skipPreferenceCheck?: boolean;
 * }} p
 */
export async function emitPlatformEvent(databases, clients, p) {
  const eventKeyNorm = String(p.eventKey || '')
    .trim()
    .toLowerCase();
  if (!eventKeyNorm) return { ok: false, reason: 'missing_event_key' };

  const event = await loadPlatformEvent(databases, eventKeyNorm);
  if (!event) return { ok: false, skipped: 'unknown_event', reason: 'no_event' };
  if (!event.notification_enabled) return { ok: false, skipped: 'disabled' };

  const payload = coercePayload(p.payload);
  const merged = {
    platform_title: 'WP Hub Pro',
    ...payload,
    event_key: eventKeyNorm,
  };

  const rendered = renderNotificationCopy(event, merged);
  if (!rendered.title.trim()) return { ok: false, reason: 'empty_title' };

  const metaObj: Record<string, unknown> = {
    event_key: eventKeyNorm,
    category: event.category,
    severity: event.severity,
    ...merged,
    used_fallback_event: !event.fromDb,
  };
  const actionMeta = buildActionMetadata(eventKeyNorm, merged);
  if (actionMeta) metaObj.action_context = actionMeta;
  const metadata = cleanMetadata(metaObj);

  const teamFromParam = p.teamId != null && String(p.teamId).trim() ? String(p.teamId).trim() : '';
  const teamFromPayload =
    typeof payload.team_id === 'string' && payload.team_id.trim()
      ? payload.team_id.trim()
      : typeof payload.teamId === 'string' && payload.teamId.trim()
        ? payload.teamId.trim()
        : '';
  const teamId =
    eventKeyNorm === 'team_invite_existing_user' ? null : teamFromParam || teamFromPayload || null;

  let recipientIds = [];
  const explicit = Array.isArray(p.recipientUserIds)
    ? p.recipientUserIds.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const single = String(p.recipientUserId || p.userId || '').trim();
  if (explicit.length > 0) recipientIds = explicit;
  else if (single) recipientIds = [single];

  if (shouldFanOutTeamNotification(eventKeyNorm, teamId) && clients.teams) {
    const members = await teamMemberUserIds(clients.teams, teamId);
    if (members.length > 0) recipientIds = members;
  }

  recipientIds = [...new Set(recipientIds)].slice(0, 500);
  if (recipientIds.length === 0) return { ok: false, reason: 'no_recipients' };

  const users = clients.users;
  let created = 0;
  for (const uid of recipientIds) {
    if (!p.skipPreferenceCheck && users) {
      const ok = await userWantsInAppNotification(users, uid, {
        eventKey: eventKeyNorm,
        type: event.category,
      });
      if (!ok) continue;
    }
    const rowTeamId = eventKeyNorm === 'team_invite_existing_user' ? null : teamId;
    const id = await createNotificationRow(
      databases,
      uid,
      rowTeamId,
      eventKeyNorm,
      rendered.title,
      rendered.body,
      metadata,
    );
    if (id) created += 1;
  }

  if (created === 0) return { ok: false, skipped: 'prefs_or_empty' };
  return { ok: true, recipientCount: created };
}

export { createNotificationRow, DATABASE_ID, NOTIFICATIONS_ID };
