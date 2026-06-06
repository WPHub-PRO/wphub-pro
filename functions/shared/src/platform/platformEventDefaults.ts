/** Default platform event rows when `platform_events` has no DB document yet. */

const FALLBACK_BY_EVENT = {
  plugin_update_available: {
    title: 'Plugin updates available',
    notification_title: 'Plugin updates available',
    notification_body: 'One or more plugins on {{site_name}} have updates pending.',
    category: 'library',
    severity: 'info',
  },
  theme_update_available: {
    title: 'Theme updates available',
    notification_title: 'Theme updates available',
    notification_body: 'One or more themes on {{site_name}} have updates pending.',
    category: 'library',
    severity: 'info',
  },
  bridge_plugin_update_available: {
    title: 'Bridge plugin update available',
    notification_title: 'Bridge plugin update available',
    notification_body:
      'Update the WP Hub bridge on {{site_name}} (installed {{installed_version}}, latest {{latest_version}}).',
    category: 'library',
    severity: 'info',
  },
  team_invite_user: {
    title: 'Team invitation',
    notification_title: 'Team invitation {{outcome}}',
    notification_body: '{{summary_line}}',
    category: 'team',
    severity: 'info',
  },
  team_invite_existing_user: {
    title: 'Team invitation',
    notification_title: 'Invitation to {{team_name}}',
    notification_body: '{{summary_line}}',
    category: 'team',
    severity: 'info',
  },
  site_health_issue: {
    title: 'Site health issue',
    notification_title: 'Site health: {{site_name}}',
    notification_body: '{{detail}}',
    category: 'site',
    severity: 'warning',
  },
  site_uptime_down: {
    title: 'Site uptime down',
    notification_title: 'Site down: {{site_name}}',
    notification_body: '{{detail}}',
    category: 'site',
    severity: 'high_risk',
  },
  site_uptime_up: {
    title: 'Site uptime restored',
    notification_title: 'Site back up: {{site_name}}',
    notification_body: '{{detail}}',
    category: 'site',
    severity: 'info',
  },
  site_connection_issue: {
    title: 'Site connection issue',
    notification_title: 'Connection issue: {{site_name}}',
    notification_body: '{{detail}}',
    category: 'site',
    severity: 'warning',
  },
  subscription_renewal_upcoming: {
    title: 'Subscription renewal upcoming',
    notification_title: 'Upcoming subscription renewal',
    notification_body: '{{detail}}',
    category: 'subscription',
    severity: 'info',
  },
  subscription_change: {
    title: 'Subscription change',
    notification_title: '{{title}}',
    notification_body: '{{body}}',
    category: 'subscription',
    severity: 'info',
  },
  limit_reached: {
    title: 'Seat limit reached',
    notification_title: 'Seat limit reached',
    notification_body: '{{detail}}',
    category: 'subscription',
    severity: 'warning',
  },
  ticket_reply: {
    title: 'Ticket reply',
    notification_title: '{{title}}',
    notification_body: '{{body}}',
    category: 'platform',
    severity: 'info',
  },
  ticket_status: {
    title: 'Ticket status change',
    notification_title: '{{title}}',
    notification_body: '{{body}}',
    category: 'platform',
    severity: 'info',
  },
  ticket_priority: {
    title: 'Ticket priority change',
    notification_title: '{{title}}',
    notification_body: '{{body}}',
    category: 'platform',
    severity: 'info',
  },
};

const PLATFORM_EVENT_KEYS = new Set(Object.keys(FALLBACK_BY_EVENT));

export { FALLBACK_BY_EVENT, PLATFORM_EVENT_KEYS };
