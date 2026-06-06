import { emitPlatformEvent } from '../platform/emitPlatformEvent.ts';
import { PLATFORM_EVENT_KEYS } from '../platform/platformEventDefaults.ts';
import { substitutePlaceholders } from '../platform/templateSubstitute.ts';
import { loadPlatformEvent, platformEventsColl as notificationTemplatesColl } from '../platform/loadPlatformEvent.ts';

/** @deprecated Use platform_events.category — kept for transition. */
const NOTIFICATION_TYPE_BY_EVENT_KEY = {
  plugin_update_available: 'library',
  theme_update_available: 'library',
  bridge_plugin_update_available: 'library',
  team_invite_user: 'team',
  team_invite_existing_user: 'team',
  site_health_issue: 'site',
  site_uptime_down: 'site',
  site_uptime_up: 'site',
  site_connection_issue: 'site',
  subscription_renewal_upcoming: 'subscription',
  subscription_change: 'subscription',
  limit_reached: 'subscription',
  ticket_reply: 'platform',
  ticket_status: 'platform',
  ticket_priority: 'platform',
};

const NOTIFICATION_TEMPLATE_EVENT_KEYS = PLATFORM_EVENT_KEYS;

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKeyNorm
 */
async function loadTemplateDocument(databases, eventKeyNorm) {
  const ev = await loadPlatformEvent(databases, eventKeyNorm);
  if (!ev) return null;
  return {
    title_template: ev.notification_title,
    body_template: ev.notification_body,
    enabled: ev.notification_enabled,
  };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{
 *   eventKey: string;
 *   recipientUserId: string;
 *   payload?: Record<string, unknown> | null;
 *   createdByUserId?: string | null;
 *   users?: import('node-appwrite').Users;
 *   teams?: import('node-appwrite').Teams | null;
 *   teamId?: string | null;
 * }} p
 */
async function sendUserNotificationFromTemplate(databases, p) {
  const eventKeyNorm = String(p.eventKey || '')
    .trim()
    .toLowerCase();
  const recipientUserId = String(p.recipientUserId || '').trim();
  if (!eventKeyNorm || !recipientUserId) return { ok: false, reason: 'missing_params' };

  return emitPlatformEvent(
    databases,
    { users: p.users, teams: p.teams ?? null },
    {
      eventKey: eventKeyNorm,
      recipientUserId,
      payload: p.payload,
      teamId: p.teamId,
    },
  );
}

export {
  NOTIFICATION_TEMPLATE_EVENT_KEYS,
  NOTIFICATION_TYPE_BY_EVENT_KEY,
  substitutePlaceholders,
  notificationTemplatesColl,
  sendUserNotificationFromTemplate,
  loadTemplateDocument,
};
