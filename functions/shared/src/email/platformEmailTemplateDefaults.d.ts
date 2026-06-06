/**
 * Built-in `system_email_templates` fallbacks when no DB row or row disabled.
 * Shortcodes: `{{name}}` — escaped in HTML unless key ends with `_html`.
 */
/** @type {Record<string, { title: string; subject: string; body_html: string; body_plain?: string }>} */
declare const DEFAULT_EMAIL_TEMPLATES_BY_EVENT: {
    team_invite: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    team_invite_existing_user: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    team_invite_user: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    plugin_update_available: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    theme_update_available: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    bridge_plugin_update_available: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    site_health_issue: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    site_uptime_down: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    site_uptime_up: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    site_connection_issue: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    subscription_renewal_upcoming: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    subscription_change: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    limit_reached: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    ticket_reply: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    ticket_status: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
    ticket_priority: {
        title: string;
        subject: string;
        body_html: string;
        body_plain: string;
    };
};
export { DEFAULT_EMAIL_TEMPLATES_BY_EVENT };
