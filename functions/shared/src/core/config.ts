/**
 * Bundled defaults when a function omits env vars (WPHub PRO).
 * Prefer setting `APPWRITE_ENDPOINT`, `APPWRITE_DATABASE_ID`, etc. on the function or global variables.
 */
export const WPHUB_DEFAULT_APPWRITE_ENDPOINT = 'https://api.wphub.pro/v1';

/** Matches `WPHUB_APPWRITE_IDS.defaults.platformDatabaseId` / `platform_db` in Appwrite. */
export const WPHUB_DEFAULT_DATABASE_ID = 'platform_db';
