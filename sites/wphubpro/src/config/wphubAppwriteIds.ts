import { PLATFORM_DB_COLLECTION_IDS } from '../../generated/appwrite/databases.js';

const P = PLATFORM_DB_COLLECTION_IDS;

/**
 * Canonical Appwrite resource `$id`s for WP Hub Pro: platform database tables (Databases API),
 * storage buckets, and function execution ids.
 *
 * Platform table ids are sourced from `generated/appwrite/databases.ts` (`PLATFORM_DB_COLLECTION_IDS`).
 * Regenerate that file when the Appwrite schema changes; then verify any non-generated entries below.
 */
export const WPHUB_APPWRITE_IDS = {
  defaults: {
    /** Used when `APPWRITE_DATABASE_ID` is unset — must match Appwrite. */
    platformDatabaseId: 'platform_db',
  },
  /** Document collection / table ids under the platform database (see `APPWRITE_DATABASE_ID`). */
  platformTables: {
    accounts: P.Accounts,
    sites: P.Sites,
    library: P.Library,
    teams: P.Teams,
    libraryCategories: P['Library Categories'],
    libraryFamilies: P['Library Families'],
    libraryCollections: P['Library Collections'],
    platformSettings: P['Platform Settings'],
    tickets: P.Tickets,
    ticketMessages: P['Ticket Messages'],
    ticketActivities: P['Ticket activities'],
    notifications: P.Notifications,
    platformEvents: 'platform_events',
    notificationReads: P['Notification reads'],
    teamInvites: P['Team invites'],
    systemEmailShell: P['System email shell'],
    systemEmailTemplates: P['System email templates'],
    notificationTemplates: P['Notification templates'],
    /**
     * `platform_db` collection for bridge release metadata (e.g. document `current`).
     * Not part of `PLATFORM_DB_COLLECTION_IDS` codegen today.
     */
    bridge: 'bridge',
  },
  /** Storage buckets. Create the `avatars` bucket in Appwrite (image/*, per-file permissions). */
  buckets: {
    platform: 'platform',
    bridge: 'bridge',
    avatars: 'avatars',
    mediaLibrary: 'media_library',
    themes: 'themes',
    plugins: 'plugins',
  },
  /** `$id` of deployed Appwrite functions — must match `functions[].$id` in `appwrite.config.json`. */
  functions: {
    BRIDGE: 'bridge',
    LIBRARY: 'library',
    MESSAGING: 'messaging',
    PLATFORM_SETTINGS: 'platform-settings',
    RECOVERY_MANAGER: 'recovery-manager',
    SITES: 'sites',
    STRIPE_API: 'stripe-api',
    SUPPORT: 'support',
    /** Alias: same Appwrite function id as `SUPPORT` (support tickets). */
    TICKETS: 'support',
    UPTIME_ROBOT: 'uptime-robot',
    USERS: 'users',
    USER_MAILBOX: 'user-mailbox',
    WP_PROXY: 'wp-proxy',
  },
} as const;

export type WphubPlatformTableId = (typeof WPHUB_APPWRITE_IDS.platformTables)[keyof typeof WPHUB_APPWRITE_IDS.platformTables];
export type WphubBucketId = (typeof WPHUB_APPWRITE_IDS.buckets)[keyof typeof WPHUB_APPWRITE_IDS.buckets];
export type WphubFunctionId = (typeof WPHUB_APPWRITE_IDS.functions)[keyof typeof WPHUB_APPWRITE_IDS.functions];
