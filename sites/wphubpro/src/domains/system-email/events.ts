/** Matches `event_key` in Appwrite `system_email_templates` + defaults in `functions-lib/systemEmail.js`. */
export type SystemEmailEventKey = 'team_invite';

export const SYSTEM_EMAIL_EVENT_OPTIONS: { value: SystemEmailEventKey; label: string }[] = [
  { value: 'team_invite', label: 'Team invitation (email invite to new address)' },
];

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
];
