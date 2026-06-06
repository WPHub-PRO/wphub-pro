/** Default platform event rows when `platform_events` has no DB document yet. */
declare const FALLBACK_BY_EVENT: {
    plugin_update_available: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    theme_update_available: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    bridge_plugin_update_available: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    team_invite_user: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    team_invite_existing_user: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    site_health_issue: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    site_uptime_down: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    site_uptime_up: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    site_connection_issue: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    subscription_renewal_upcoming: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    subscription_change: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    limit_reached: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    ticket_reply: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    ticket_status: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
    ticket_priority: {
        title: string;
        notification_title: string;
        notification_body: string;
        category: string;
        severity: string;
    };
};
declare const PLATFORM_EVENT_KEYS: Set<string>;
export { FALLBACK_BY_EVENT, PLATFORM_EVENT_KEYS };
