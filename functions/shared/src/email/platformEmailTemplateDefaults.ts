/**
 * Built-in `system_email_templates` fallbacks when no DB row or row disabled.
 * Shortcodes: `{{name}}` — escaped in HTML unless key ends with `_html`.
 */

const FOOTER_CTA = `<p style="margin-top:24px"><a href="{{app_url}}">Open {{platform_title}}</a></p>`;

/** @type {Record<string, { title: string; subject: string; body_html: string; body_plain?: string }>} */
const DEFAULT_EMAIL_TEMPLATES_BY_EVENT = {
  team_invite: {
    title: 'Team invitation',
    subject: 'Invitation: join {{team_name}} on {{platform_title}}',
    body_html: `<p>You have been invited to join <strong>{{team_name}}</strong> on {{platform_title}}.</p>
<p style="margin:24px 0">
  <a href="{{invite_accept_url}}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Accept</a>
  &nbsp;
  <a href="{{invite_decline_url}}" style="display:inline-block;padding:12px 20px;background:#6c757d;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Decline</a>
</p>
<p style="font-size:13px;color:#666">If the buttons do not work, copy this link into your browser:<br/><a href="{{invite_review_url}}">{{invite_review_url}}</a></p>`,
    body_plain:
      'You have been invited to join {{team_name}} on {{platform_title}}.\n\nAccept: {{invite_accept_url}}\nDecline: {{invite_decline_url}}\nReview: {{invite_review_url}}',
  },
  team_invite_existing_user: {
    title: 'Team invitation (existing account)',
    subject: 'Invitation to join {{team_name}} on {{platform_title}}',
    body_html: `<p>{{invited_by_name}} ({{invited_by_email}}) invited you to join <strong>{{team_name}}</strong> on {{platform_title}}.</p>
<p>{{summary_line}}</p>
<p style="margin:24px 0">
  <a href="{{invite_accept_url}}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">{{accept_cta}}</a>
  &nbsp;
  <a href="{{invite_decline_url}}" style="display:inline-block;padding:12px 20px;background:#6c757d;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">{{decline_cta}}</a>
</p>
${FOOTER_CTA}`,
    body_plain:
      'You were invited to {{team_name}} on {{platform_title}}.\n{{summary_line}}\n\nAccept: {{invite_accept_url}}\nDecline: {{invite_decline_url}}',
  },
  team_invite_user: {
    title: 'Team invitation (owner notice)',
    subject: 'Team invite update: {{team_name}}',
    body_html: `<p>Team invitation for <strong>{{team_name}}</strong>: {{outcome}}</p>
<p>{{summary_line}}</p>
<p>Invitee: {{invitee_email}}</p>
${FOOTER_CTA}`,
    body_plain: 'Team invite for {{team_name}}: {{outcome}}\n{{summary_line}}\nInvitee: {{invitee_email}}',
  },
  plugin_update_available: {
    title: 'Plugin updates available',
    subject: 'Plugin updates on {{site_name}}',
    body_html: `<p>One or more plugins on <strong>{{site_name}}</strong> have updates pending.</p>
<p>{{detail}}</p>
<p>Site: <a href="{{site_url}}">{{site_url}}</a></p>
${FOOTER_CTA}`,
    body_plain: 'Plugin updates on {{site_name}} ({{site_url}}).\n{{detail}}',
  },
  theme_update_available: {
    title: 'Theme updates available',
    subject: 'Theme updates on {{site_name}}',
    body_html: `<p>One or more themes on <strong>{{site_name}}</strong> have updates pending.</p>
<p>{{detail}}</p>
<p>Site: <a href="{{site_url}}">{{site_url}}</a></p>
${FOOTER_CTA}`,
    body_plain: 'Theme updates on {{site_name}}.\n{{detail}}',
  },
  bridge_plugin_update_available: {
    title: 'Bridge plugin update',
    subject: 'Bridge plugin update for {{site_name}}',
    body_html: `<p>Update the WP Hub bridge on <strong>{{site_name}}</strong>.</p>
<p>Installed: {{installed_version}} · Latest: {{latest_version}}</p>
<p>{{detail}}</p>
${FOOTER_CTA}`,
    body_plain:
      'Bridge update on {{site_name}}: installed {{installed_version}}, latest {{latest_version}}.\n{{detail}}',
  },
  site_health_issue: {
    title: 'Site health issue',
    subject: 'Site health: {{site_name}}',
    body_html: `<p>A health issue was detected on <strong>{{site_name}}</strong>.</p>
<p>{{detail}}</p>
<p>Site: <a href="{{site_url}}">{{site_url}}</a></p>
${FOOTER_CTA}`,
    body_plain: 'Site health issue on {{site_name}}.\n{{detail}}',
  },
  site_uptime_down: {
    title: 'Site uptime down',
    subject: 'Site down: {{site_name}}',
    body_html: `<p><strong>{{site_name}}</strong> appears to be down ({{status_label}}).</p>
<p>{{detail}}</p>
<p>Monitor: {{monitor_name}} — <a href="{{monitor_url}}">{{monitor_url}}</a></p>
${FOOTER_CTA}`,
    body_plain: 'Site down: {{site_name}} ({{status_label}}).\n{{detail}}',
  },
  site_uptime_up: {
    title: 'Site uptime restored',
    subject: 'Site back up: {{site_name}}',
    body_html: `<p><strong>{{site_name}}</strong> is responding again ({{status_label}}).</p>
<p>{{detail}}</p>
${FOOTER_CTA}`,
    body_plain: 'Site back up: {{site_name}}.\n{{detail}}',
  },
  site_connection_issue: {
    title: 'Site connection issue',
    subject: 'Connection issue: {{site_name}}',
    body_html: `<p>We could not connect to <strong>{{site_name}}</strong>.</p>
<p>{{detail}}</p>
<p>Site: <a href="{{site_url}}">{{site_url}}</a></p>
${FOOTER_CTA}`,
    body_plain: 'Connection issue on {{site_name}}.\n{{detail}}',
  },
  subscription_renewal_upcoming: {
    title: 'Subscription renewal upcoming',
    subject: 'Upcoming renewal on {{platform_title}}',
    body_html: `<p>Your subscription is due for renewal soon.</p>
<p>{{detail}}</p>
${FOOTER_CTA}`,
    body_plain: 'Subscription renewal upcoming.\n{{detail}}',
  },
  subscription_change: {
    title: 'Subscription change',
    subject: '{{title}}',
    body_html: `<p><strong>{{title}}</strong></p>
<p>{{body}}</p>
<p>Plan: {{plan_name}} · Change: {{change_kind}}</p>
${FOOTER_CTA}`,
    body_plain: '{{title}}\n{{body}}',
  },
  limit_reached: {
    title: 'Seat limit reached',
    subject: 'Seat limit reached for your workspace',
    body_html: `<p>Your workspace has reached the seat limit (max {{max_seats}}).</p>
<p>{{detail}}</p>
${FOOTER_CTA}`,
    body_plain: 'Seat limit reached (max {{max_seats}}).\n{{detail}}',
  },
  ticket_reply: {
    title: 'Support ticket reply',
    subject: '{{title}}',
    body_html: `<p>{{title}}</p>
<p>{{body}}</p>
${FOOTER_CTA}`,
    body_plain: '{{title}}\n{{body}}',
  },
  ticket_status: {
    title: 'Support ticket status',
    subject: '{{title}}',
    body_html: `<p>{{title}}</p>
<p>{{body}}</p>
${FOOTER_CTA}`,
    body_plain: '{{title}}\n{{body}}',
  },
  ticket_priority: {
    title: 'Support ticket priority',
    subject: '{{title}}',
    body_html: `<p>{{title}}</p>
<p>{{body}}</p>
${FOOTER_CTA}`,
    body_plain: '{{title}}\n{{body}}',
  },
};

export { DEFAULT_EMAIL_TEMPLATES_BY_EVENT };
