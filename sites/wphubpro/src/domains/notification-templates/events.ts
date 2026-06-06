/** Canonical platform automation keys — rows stored in `notification_templates`. */
export type NotificationTemplateEventKey =
  | 'plugin_update_available'
  | 'theme_update_available'
  | 'team_invite_user'
  | 'team_invite_existing_user'
  | 'site_health_issue'
  | 'site_uptime_down'
  | 'site_uptime_up'
  | 'site_connection_issue'
  | 'subscription_renewal_upcoming'
  | 'bridge_plugin_update_available'
  | 'limit_reached'
  | 'subscription_change'

export const NOTIFICATION_TEMPLATE_EVENT_OPTIONS: { value: NotificationTemplateEventKey; label: string }[] = [
  { value: 'plugin_update_available', label: 'Plugin update available' },
  { value: 'theme_update_available', label: 'Theme update available' },
  { value: 'team_invite_user', label: 'Team invite (owner notice)' },
  {
    value: 'team_invite_existing_user',
    label: 'Team invite — existing account (in-app notice)',
  },
  { value: 'site_health_issue', label: 'Site health issue' },
  { value: 'site_uptime_down', label: 'Site uptime: down' },
  { value: 'site_uptime_up', label: 'Site uptime: back up' },
  { value: 'site_connection_issue', label: 'Site connection issue' },
  { value: 'subscription_renewal_upcoming', label: 'Subscription renewal (upcoming)' },
  { value: 'bridge_plugin_update_available', label: 'Bridge plugin update' },
  { value: 'limit_reached', label: 'Team seat limit reached' },
  { value: 'subscription_change', label: 'Subscription status (Stripe / admin ops)' },
]

/** UI hint: placeholder names per event (use in `{{name}}` in title/body). */
export const NOTIFICATION_TEMPLATE_PLACEHOLDERS: Record<NotificationTemplateEventKey, string[]> = {
  plugin_update_available: ['site_name', 'site_url', 'site_id', 'count', 'item_name', 'detail', 'event_key'],
  theme_update_available: ['site_name', 'site_url', 'site_id', 'count', 'item_name', 'detail', 'event_key'],
  team_invite_user: ['team_name', 'invitee_email', 'outcome', 'summary_line', 'event_key'],
  team_invite_existing_user: [
    'team_name',
    'team_id',
    'invited_by_email',
    'invited_by_name',
    'summary_line',
    'accept_cta',
    'decline_cta',
    'invite_id',
    'invite_token',
    'event_key',
  ],
  site_health_issue: ['site_name', 'site_url', 'site_id', 'detail', 'external_uptime_status', 'event_key'],
  site_uptime_down: [
    'site_name',
    'site_url',
    'site_id',
    'detail',
    'status_label',
    'monitor_name',
    'monitor_url',
    'external_uptime_status',
    'event_key',
  ],
  site_uptime_up: [
    'site_name',
    'site_url',
    'site_id',
    'detail',
    'status_label',
    'monitor_name',
    'monitor_url',
    'external_uptime_status',
    'event_key',
  ],
  site_connection_issue: ['site_name', 'site_url', 'site_id', 'detail', 'event_key'],
  subscription_renewal_upcoming: ['detail', 'subscription_id', 'period_end', 'event_key'],
  bridge_plugin_update_available: [
    'site_name',
    'site_url',
    'site_id',
    'installed_version',
    'latest_version',
    'detail',
    'event_key',
  ],
  limit_reached: ['detail', 'max_seats', 'team_id', 'event_key'],
  subscription_change: ['title', 'body', 'plan_name', 'change_kind', 'subscription_id', 'event_key'],
}

/** Optional short explanations for the admin template UI (keyed by placeholder name). */
export const NOTIFICATION_TEMPLATE_PLACEHOLDER_HINTS: Partial<
  Record<NotificationTemplateEventKey, Partial<Record<string, string>>>
> = {
  team_invite_existing_user: {
    accept_cta:
      'Text for the in-app Accept button; mirror it in the body next to your accept action.',
    decline_cta:
      'Text for the in-app Decline button; mirror it in the body next to your decline action.',
    invite_token:
      'Secret for invite links — avoid putting in broadly shared copy.',
    invite_id: 'Internal invite id — optional in copy.',
  },
}
