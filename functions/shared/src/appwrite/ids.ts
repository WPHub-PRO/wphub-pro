/**
 * Canonical Appwrite resource `$id`s for serverless functions.
 *
 * **`platformTables`** strings match `tables` `$id`s under **`tablesDB`** `platform_db` in **`appwrite.config.json`**
 * (same values as **`wphubpro/generated/appwrite/databases.ts`** /
 * **`wphubpro/src/config/wphubAppwriteIds.ts`**).
 *
 * **`functions`** `$id`s match **`functions[].$id`** in **`appwrite.config.json`**.
 */
const WPHUB_APPWRITE_IDS = {
  defaults: {
    platformDatabaseId: 'platform_db',
  },
  platformTables: {
    accounts: 'accounts',
    sites: 'sites',
    library: 'library',
    teams: 'teams',
    libraryCategories: 'library_categories',
    libraryFamilies: 'library_families',
    libraryCollections: 'library_collections',
    platformSettings: 'platform_settings',
    tickets: 'tickets',
    ticketMessages: 'ticket_messages',
    ticketActivities: 'ticket_activities',
    notifications: 'notifications',
    platformEvents: 'platform_events',
    teamInvites: 'team_invites',
    systemEmailShell: 'system_email_shell',
    systemEmailTemplates: 'system_email_templates',
    bridge: 'bridge',
  },
  buckets: {
    /** General-purpose bucket (`dev` in `appwrite.config.json`; `$id` is the hex string). */
    platform: '6a0e670d00380379a6d4',
    bridge: 'bridge',
    avatars: 'avatars',
    mediaLibrary: 'media_library',
    themes: 'themes',
    plugins: 'plugins',
  },
  functions: {
    BRIDGE: 'bridge',
    LIBRARY: 'library',
    MESSAGING: 'messaging',
    PLATFORM_SETTINGS: 'platform-settings',
    RECOVERY_MANAGER: 'recovery-manager',
    SITES: 'sites',
    STRIPE_API: 'stripe-api',
    SUPPORT: 'support',
    TICKETS: 'support',
    UPTIME_ROBOT: 'uptime-robot',
    USERS: 'users',
    USER_MAILBOX: 'user-mailbox',
    WP_PROXY: 'wp-proxy',
  },
};

const DEFAULT_PLATFORM_TEAMS_TABLE_ID = 'teams';

/**
 * TablesDB collection id for team billing metadata (`teams` in `appwrite.config.json`).
 * Older deployed `functions-lib` may omit `platformTables.teams`; default matches WPHub schema.
 * @returns {string}
 */
function platformTeamsTableId() {
  const v = WPHUB_APPWRITE_IDS.platformTables && WPHUB_APPWRITE_IDS.platformTables.teams;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return DEFAULT_PLATFORM_TEAMS_TABLE_ID;
}

export { WPHUB_APPWRITE_IDS, platformTeamsTableId };
