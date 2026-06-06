import { substitutePlaceholders } from '../platform/templateSubstitute.ts';
import { platformEventsColl as notificationTemplatesColl } from '../platform/loadPlatformEvent.ts';
/** @deprecated Use platform_events.category — kept for transition. */
declare const NOTIFICATION_TYPE_BY_EVENT_KEY: {
    plugin_update_available: string;
    theme_update_available: string;
    bridge_plugin_update_available: string;
    team_invite_user: string;
    team_invite_existing_user: string;
    site_health_issue: string;
    site_uptime_down: string;
    site_uptime_up: string;
    site_connection_issue: string;
    subscription_renewal_upcoming: string;
    subscription_change: string;
    limit_reached: string;
    ticket_reply: string;
    ticket_status: string;
    ticket_priority: string;
};
declare const NOTIFICATION_TEMPLATE_EVENT_KEYS: Set<string>;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKeyNorm
 */
declare function loadTemplateDocument(databases: any, eventKeyNorm: any): Promise<{
    title_template: any;
    body_template: any;
    enabled: boolean;
}>;
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
declare function sendUserNotificationFromTemplate(databases: any, p: any): Promise<{
    ok: boolean;
    reason: string;
    skipped?: undefined;
    recipientCount?: undefined;
} | {
    ok: boolean;
    skipped: string;
    reason: string;
    recipientCount?: undefined;
} | {
    ok: boolean;
    skipped: string;
    reason?: undefined;
    recipientCount?: undefined;
} | {
    ok: boolean;
    recipientCount: number;
    reason?: undefined;
    skipped?: undefined;
}>;
export { NOTIFICATION_TEMPLATE_EVENT_KEYS, NOTIFICATION_TYPE_BY_EVENT_KEY, substitutePlaceholders, notificationTemplatesColl, sendUserNotificationFromTemplate, loadTemplateDocument, };
