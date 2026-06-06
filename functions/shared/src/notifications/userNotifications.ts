import { emitPlatformEvent } from '../platform/emitPlatformEvent.ts';

/**
 * Create one in-app notification row per recipient (via platform event).
 * @param {import('node-appwrite').Databases} databases
 * @param {{
 *   recipientUserIds?: string[] | unknown;
 *   recipientUserId?: string;
 *   type?: string;
 *   eventKey?: string;
 *   title?: string;
 *   body?: string;
 *   metadata?: unknown;
 *   createdByUserId?: string | null;
 *   users?: import('node-appwrite').Users;
 *   teams?: import('node-appwrite').Teams | null;
 *   eventKey?: string;
 *   teamId?: string | null;
 *   skipPreferenceCheck?: boolean;
 * }} p
 * @returns {Promise<string | null>} first created document id or null
 */
async function createUserNotification(databases, p) {
  const eventKey = String(p.eventKey || p.type || '').trim().toLowerCase();
  if (!eventKey) return null;

  let payload: Record<string, unknown> = {};
  if (p.metadata != null) {
    if (typeof p.metadata === 'string') {
      try {
        payload = JSON.parse(p.metadata);
      } catch {
        payload = {};
      }
    } else if (typeof p.metadata === 'object') {
      payload = { ...p.metadata };
    }
  }
  if (p.title) payload.title = p.title;
  if (p.body) payload.body = p.body;

  const recipientUserIds = Array.isArray(p.recipientUserIds)
    ? p.recipientUserIds
    : p.recipientUserId
      ? [p.recipientUserId]
      : [];

  const result = await emitPlatformEvent(
    databases,
    { users: p.users, teams: p.teams ?? null },
    {
      eventKey,
      payload,
      recipientUserIds,
      teamId: p.teamId,
      skipPreferenceCheck: p.skipPreferenceCheck,
    },
  );

  return result.ok ? 'ok' : null;
}

/** @deprecated Admin broadcast removed — use automated platform events only. */
async function createBroadcastNotification() {
  throw new Error('createBroadcastNotification is removed; use emitPlatformEvent per recipient.');
}

export { DATABASE_ID, NOTIFICATIONS_ID } from '../platform/emitPlatformEvent.ts';

export {
  createUserNotification,
  createBroadcastNotification,
};
