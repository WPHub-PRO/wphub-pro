/**
 * In-app notification preference gate (shared by userNotifications / all functions).
 * List/topbar/workspace filtering lives in the messaging function (`notificationInboxPrefs.js`).
 * Keep event keys in sync with `wphubpro/src/domains/notifications/prefDefinitions.ts`.
 */
const NOTIFICATION_PREF_ITEMS = [
  { key: 'plugin_update_available', label: 'Plugin updates available', group: 'Library & site' },
  { key: 'theme_update_available', label: 'Theme updates available', group: 'Library & site' },
  { key: 'bridge_plugin_update_available', label: 'Bridge plugin updates', group: 'Library & site' },
  { key: 'team_invite_user', label: 'Team invitations (new user)', group: 'Team' },
  { key: 'team_invite_existing_user', label: 'Team invitations (existing user)', group: 'Team' },
  { key: 'site_health_issue', label: 'Site health issues', group: 'Sites' },
  { key: 'site_uptime_down', label: 'Site uptime: down', group: 'Sites' },
  { key: 'site_uptime_up', label: 'Site uptime: back up', group: 'Sites' },
  { key: 'site_connection_issue', label: 'Site connection issues', group: 'Sites' },
  { key: 'subscription_renewal_upcoming', label: 'Upcoming subscription renewal', group: 'Billing' },
  { key: 'subscription_change', label: 'Subscription changes', group: 'Billing' },
  { key: 'limit_reached', label: 'Seat / plan limits', group: 'Billing' },
  { key: 'ticket_reply', label: 'Support ticket replies', group: 'Support' },
  { key: 'ticket_status', label: 'Support ticket status changes', group: 'Support' },
  { key: 'ticket_priority', label: 'Support ticket priority changes', group: 'Support' },
  { key: 'library_update', label: 'Library updates (general)', group: 'Library & site' },
  { key: 'subscription', label: 'Subscription (general)', group: 'Billing' },
  { key: 'platform', label: 'Platform announcements', group: 'General' },
];

const PREF_KEY_SET = new Set(NOTIFICATION_PREF_ITEMS.map((x) => x.key));

/**
 * @param {import('node-appwrite').Users} users
 * @param {string} userId
 * @param {{ eventKey?: string; type?: string }} channel
 * @returns {Promise<boolean>}
 */
async function userWantsInAppNotification(users, userId, channel) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  let u;
  try {
    u = await users.get(uid);
  } catch {
    return true;
  }
  const prefs = u.prefs && typeof u.prefs === 'object' ? u.prefs : {};
  if (prefs.notifyPlatform === false) return false;

  const eventKey = String(channel.eventKey || '')
    .trim()
    .toLowerCase();
  const type = String(channel.type || '')
    .trim()
    .toLowerCase();

  const map = prefs.notificationEventPrefs;
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    if (eventKey && map[eventKey] === false) return false;
    if (type && map[type] === false) return false;
  }
  return true;
}

export { NOTIFICATION_PREF_ITEMS, PREF_KEY_SET, userWantsInAppNotification };
