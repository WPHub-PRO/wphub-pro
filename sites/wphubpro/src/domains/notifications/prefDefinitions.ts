/** Keep keys in sync with `functions-lib/notificationPrefs.js` → `NOTIFICATION_PREF_ITEMS`. */
export const NOTIFICATION_PREF_DEFINITIONS = [
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
] as const

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_DEFINITIONS)[number]['key']

export const NOTIFICATION_RETENTION_OPTIONS = [
  { value: '', label: 'No limit (keep until dismissed)' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '180', label: '180 days' },
  { value: '365', label: '1 year' },
] as const
