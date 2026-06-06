/**
 * Platform database table `$id`s for `platform_db`.
 *
 * Kept in sync with `appwrite.config.json` → `tablesDB` / `platform_db`. Do not replace this file with
 * full `appwrite generate` SDK output here — that output targets `erasableSyntaxOnly`-incompatible patterns;
 * regenerate ids manually after schema changes, then run id sync per `wphub-appwrite-ids.mdc`.
 */
import type { Client } from 'appwrite';
import { TablesDB } from 'appwrite';

export const PLATFORM_DB_COLLECTION_IDS = {
  Accounts: 'accounts',
  Sites: 'sites',
  Library: 'library',
  Teams: 'teams',
  'Library Categories': 'library_categories',
  'Library Families': 'library_families',
  'Library Collections': 'library_collections',
  'Platform Settings': 'platform_settings',
  Tickets: 'tickets',
  'Ticket Messages': 'ticket_messages',
  'Ticket activities': 'ticket_activities',
  /** In-app notification rows (user or broadcast). */
  Notifications: 'notifications',
  /** Read receipts for broadcast notifications. */
  'Notification reads': 'notification_reads',
  /** Pending email invites to join a team (HMAC token in URL; row deleted on accept/decline). */
  'Team invites': 'team_invites',
  /** Global HTML wrapper for transactional emails (single doc id `default`). */
  'System email shell': 'system_email_shell',
  /** Per-event template rows (`event_key` unique). */
  'System email templates': 'system_email_templates',
  /** In-app notification templates (`event_key` unique). */
  'Notification templates': 'notification_templates',
} as const;

export function createDatabaseTablesApi(client: Client): TablesDB {
  return new TablesDB(client);
}
