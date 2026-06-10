/** Matches `event_key` in Appwrite `system_email_templates` + defaults in `functions-lib`. */
export type SystemEmailEventKey =
  | 'team_invite'
  | 'plugin_update_available'
  | 'theme_update_available'
  | 'bridge_plugin_update_available'
  | 'team_invite_user'
  | 'team_invite_existing_user'
  | 'site_health_issue'
  | 'site_uptime_down'
  | 'site_uptime_up'
  | 'site_connection_issue'
  | 'subscription_renewal_upcoming'
  | 'subscription_change'
  | 'limit_reached'
  | 'ticket_reply'
  | 'ticket_status'
  | 'ticket_priority'

export const SYSTEM_EMAIL_EVENT_OPTIONS: { value: SystemEmailEventKey; label: string }[] = [
  { value: 'team_invite', label: 'Team invitation (email to new address)' },
  { value: 'team_invite_existing_user', label: 'Team invitation (existing account)' },
  { value: 'team_invite_user', label: 'Team invitation (owner notice)' },
  { value: 'plugin_update_available', label: 'Plugin updates available' },
  { value: 'theme_update_available', label: 'Theme updates available' },
  { value: 'bridge_plugin_update_available', label: 'Bridge plugin update' },
  { value: 'site_health_issue', label: 'Site health issue' },
  { value: 'site_uptime_down', label: 'Site uptime: down' },
  { value: 'site_uptime_up', label: 'Site uptime: back up' },
  { value: 'site_connection_issue', label: 'Site connection issue' },
  { value: 'subscription_renewal_upcoming', label: 'Subscription renewal (upcoming)' },
  { value: 'subscription_change', label: 'Subscription change' },
  { value: 'limit_reached', label: 'Seat limit reached' },
  { value: 'ticket_reply', label: 'Support ticket reply' },
  { value: 'ticket_status', label: 'Support ticket status' },
  { value: 'ticket_priority', label: 'Support ticket priority' },
]

/** Placeholders commonly used per event (for admin hints). */
export const SYSTEM_EMAIL_PLACEHOLDERS: Partial<Record<SystemEmailEventKey, string[]>> = {
  team_invite: [
    'team_name',
    'platform_title',
    'invite_accept_url',
    'invite_decline_url',
    'invite_review_url',
    'user_email',
    'app_url',
  ],
  team_invite_existing_user: [
    'team_name',
    'team_id',
    'invited_by_email',
    'invited_by_name',
    'summary_line',
    'accept_cta',
    'decline_cta',
    'invite_accept_url',
    'invite_decline_url',
    'platform_title',
    'app_url',
  ],
  team_invite_user: ['team_name', 'invitee_email', 'outcome', 'summary_line', 'platform_title', 'app_url'],
  plugin_update_available: ['site_name', 'site_url', 'site_id', 'detail', 'item_name', 'count', 'platform_title', 'app_url'],
  theme_update_available: ['site_name', 'site_url', 'site_id', 'detail', 'item_name', 'count', 'platform_title', 'app_url'],
  bridge_plugin_update_available: [
    'site_name',
    'site_url',
    'installed_version',
    'latest_version',
    'detail',
    'platform_title',
    'app_url',
  ],
  site_health_issue: ['site_name', 'site_url', 'site_id', 'detail', 'platform_title', 'app_url'],
  site_uptime_down: [
    'site_name',
    'site_url',
    'detail',
    'status_label',
    'monitor_name',
    'monitor_url',
    'platform_title',
    'app_url',
  ],
  site_uptime_up: ['site_name', 'site_url', 'detail', 'status_label', 'monitor_name', 'monitor_url', 'platform_title', 'app_url'],
  site_connection_issue: ['site_name', 'site_url', 'site_id', 'detail', 'platform_title', 'app_url'],
  subscription_renewal_upcoming: ['detail', 'subscription_id', 'period_end', 'platform_title', 'app_url'],
  subscription_change: ['title', 'body', 'plan_name', 'change_kind', 'subscription_id', 'platform_title', 'app_url'],
  limit_reached: ['detail', 'max_seats', 'team_id', 'platform_title', 'app_url'],
  ticket_reply: ['title', 'body', 'platform_title', 'app_url'],
  ticket_status: ['title', 'body', 'platform_title', 'app_url'],
  ticket_priority: ['title', 'body', 'platform_title', 'app_url'],
}

export const SYSTEM_EMAIL_SHORTCODE_HELP: { token: string; description: string }[] = [
  { token: '{{team_name}}', description: 'Team display name' },
  { token: '{{platform_title}}', description: 'Platform title from branding settings' },
  { token: '{{plan_name}}', description: 'Subscription / plan label (when applicable)' },
  { token: '{{site_name}}', description: 'Connected WordPress site name' },
  { token: '{{site_url}}', description: 'Site URL' },
  { token: '{{app_url}}', description: 'Hub app base URL' },
  { token: '{{user_email}}', description: 'Recipient email' },
  { token: '{{recipient_name}}', description: 'Recipient display name' },
  { token: '{{invite_accept_url}}', description: 'Accept / register link (team invite)' },
  { token: '{{invite_decline_url}}', description: 'Decline link' },
  { token: '{{invite_review_url}}', description: 'Invite review landing URL' },
  { token: '{{detail}}', description: 'Event-specific detail text' },
  { token: '{{title}}', description: 'Notification / email title line' },
  { token: '{{body}}', description: 'Notification / email body line' },
]
