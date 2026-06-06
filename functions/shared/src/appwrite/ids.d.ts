/**
 * Canonical Appwrite resource `$id`s for serverless functions.
 *
 * **`platformTables`** strings match `tables` `$id`s under **`tablesDB`** `platform_db` in **`appwrite.config.json`**
 * (same values as **`wphubpro/generated/appwrite/databases.ts`** /
 * **`wphubpro/src/config/wphubAppwriteIds.ts`**).
 *
 * **`functions`** `$id`s match **`functions[].$id`** in **`appwrite.config.json`**.
 */
declare const WPHUB_APPWRITE_IDS: {
    defaults: {
        platformDatabaseId: string;
    };
    platformTables: {
        accounts: string;
        sites: string;
        library: string;
        teams: string;
        libraryCategories: string;
        libraryFamilies: string;
        libraryCollections: string;
        platformSettings: string;
        tickets: string;
        ticketMessages: string;
        ticketActivities: string;
        notifications: string;
        platformEvents: string;
        teamInvites: string;
        systemEmailShell: string;
        systemEmailTemplates: string;
        bridge: string;
    };
    buckets: {
        /** General-purpose bucket (`dev` in `appwrite.config.json`; `$id` is the hex string). */
        platform: string;
        bridge: string;
        avatars: string;
        mediaLibrary: string;
        themes: string;
        plugins: string;
    };
    functions: {
        BRIDGE: string;
        LIBRARY: string;
        MESSAGING: string;
        PLATFORM_SETTINGS: string;
        RECOVERY_MANAGER: string;
        SITES: string;
        STRIPE_API: string;
        SUPPORT: string;
        TICKETS: string;
        UPTIME_ROBOT: string;
        USERS: string;
        USER_MAILBOX: string;
        WP_PROXY: string;
    };
};
/**
 * TablesDB collection id for team billing metadata (`teams` in `appwrite.config.json`).
 * Older deployed `functions-lib` may omit `platformTables.teams`; default matches WPHub schema.
 * @returns {string}
 */
declare function platformTeamsTableId(): string;
export { WPHUB_APPWRITE_IDS, platformTeamsTableId };
