import { Client, Account, Databases, Functions, Storage, Teams, Avatars, ID, OAuthProvider } from 'appwrite';

import { ENDPOINT as DEFAULT_APPWRITE_ENDPOINT, PROJECT_ID as DEFAULT_APPWRITE_PROJECT_ID } from '../../generated/appwrite/constants.js';
import { createDatabaseTablesApi } from '../../generated/appwrite/databases.js';
import { WPHUB_APPWRITE_IDS } from '@/config/wphubAppwriteIds';

export { OAuthProvider };
export { WPHUB_APPWRITE_IDS };

const viteEnv = (import.meta as any).env as Record<string, string | undefined>;

/**
 * Reads env: `import.meta.env[key]` first, then `process.env[key]` (Node / tooling).
 * Supported Appwrite keys for this app: `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`,
 * `APPWRITE_DATABASE_ID`, optional `APPWRITE_ADMIN_TEAM_ID` (legacy contact id; see `ADMIN_TEAM_ID`).
 * `APPWRITE_FUNCTION_*` or per-collection env overrides — use `generated/appwrite/` instead.
 */
function envString(key: string, fallback: string): string {
  const v1 = viteEnv[key];
  if (typeof v1 === 'string' && v1.trim() !== '') return v1.trim();
  if (typeof process !== 'undefined' && process.env) {
    const v2 = process.env[key];
    if (typeof v2 === 'string' && v2.trim() !== '') return v2.trim();
  }
  return fallback;
}

/**
 * Appwrite config — defaults from `generated/appwrite/constants.ts` / `databases.ts`.
 * Client bundle: never rely on `APPWRITE_API_KEY` in browser code (server / functions only).
 */
export const APPWRITE_ENDPOINT = envString('APPWRITE_ENDPOINT', DEFAULT_APPWRITE_ENDPOINT);
/** Same as `projectId` in `appwrite.config.json`. */
export const APPWRITE_PROJECT_ID = envString('APPWRITE_PROJECT_ID', DEFAULT_APPWRITE_PROJECT_ID);
/** Bridge heartbeat base URL (optional; not read from env — set in code if needed). */
export const APPWRITE_HEARTBEAT_URL = '';

if (!APPWRITE_PROJECT_ID || APPWRITE_PROJECT_ID.trim() === '') {
  throw new Error(
    'Appwrite project ID ontbreekt. Zet APPWRITE_PROJECT_ID in .env en herstart de dev server.',
  );
}

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

/** sessionStorage key — reapplied on load so impersonation survives refresh. */
export const WPHUB_IMPERSONATE_USER_ID_STORAGE_KEY = 'wphub_impersonate_user_id';
/** Who started custom REST impersonation (admin id); used for privileged API calls. */
export const WPHUB_IMPERSONATE_OPERATOR_ID_STORAGE_KEY = 'wphub_impersonate_operator_id';

const HEADER_IMPERSONATE_USER_ID = 'X-Appwrite-Impersonate-User-Id';
const HEADER_IMPERSONATE_USER_EMAIL = 'X-Appwrite-Impersonate-User-Email';
const HEADER_IMPERSONATE_USER_PHONE = 'X-Appwrite-Impersonate-User-Phone';

export function getStoredImpersonationUserId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(WPHUB_IMPERSONATE_USER_ID_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function clearImpersonationFromStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(WPHUB_IMPERSONATE_USER_ID_STORAGE_KEY);
    sessionStorage.removeItem(WPHUB_IMPERSONATE_OPERATOR_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getStoredImpersonationOperatorId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(WPHUB_IMPERSONATE_OPERATOR_ID_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function persistImpersonationOperatorId(userId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (userId && userId.trim()) {
      sessionStorage.setItem(WPHUB_IMPERSONATE_OPERATOR_ID_STORAGE_KEY, userId.trim());
    } else {
      sessionStorage.removeItem(WPHUB_IMPERSONATE_OPERATOR_ID_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * User id to send for admin-only function payloads when the UI acts as another user:
 * native impersonation → impersonator; custom header impersonation → stored operator; else current user.
 */
export function getPrivilegedActorUserId(user: {
  $id: string;
  impersonatorUserId?: string;
} | null): string | null {
  if (!user) return null;
  if (user.impersonatorUserId?.trim()) return user.impersonatorUserId.trim();
  const target = getStoredImpersonationUserId();
  if (target) {
    const op = getStoredImpersonationOperatorId();
    if (op?.trim()) return op.trim();
  }
  return user.$id;
}

/**
 * Sets or clears REST impersonation headers on the shared Appwrite client.
 * Web SDK 17 has no `setImpersonateUserId()`; headers match Appwrite REST docs.
 */
export function setImpersonationTargetOnClient(userId: string | null): void {
  const h = client.headers as Record<string, string>;
  delete h[HEADER_IMPERSONATE_USER_EMAIL];
  delete h[HEADER_IMPERSONATE_USER_PHONE];
  if (userId && userId.trim()) {
    h[HEADER_IMPERSONATE_USER_ID] = userId.trim();
  } else {
    delete h[HEADER_IMPERSONATE_USER_ID];
  }
}

export function persistImpersonationUserId(userId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (userId && userId.trim()) {
      sessionStorage.setItem(WPHUB_IMPERSONATE_USER_ID_STORAGE_KEY, userId.trim());
    } else {
      sessionStorage.removeItem(WPHUB_IMPERSONATE_USER_ID_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Call before `account.get()` on bootstrap so a full reload keeps impersonation. */
export function applyStoredImpersonationHeaders(): void {
  const id = getStoredImpersonationUserId();
  setImpersonationTargetOnClient(id);
}

export function clearImpersonationClientAndStorage(): void {
  setImpersonationTargetOnClient(null);
  clearImpersonationFromStorage();
}

export const account = new Account(client);
export const databases = new Databases(client);
/** Typed Tables API — same {@link client} as `databases` (session + impersonation). */
export const databaseTables = createDatabaseTablesApi(client);
export const functions = new Functions(client);
export const storage = new Storage(client);
export const teams = new Teams(client);
export const avatars = new Avatars(client);

export { client, ID };

/** Database `$id` — override with `APPWRITE_DATABASE_ID` only. */
export const DATABASE_ID = envString('APPWRITE_DATABASE_ID', WPHUB_APPWRITE_IDS.defaults.platformDatabaseId);

const T = WPHUB_APPWRITE_IDS.platformTables;

/** Table `$id`s under the platform database — from `src/config/wphubAppwriteIds.ts` (generated-backed). */
export const ACCOUNTS_COLLECTION_ID = T.accounts;
export const SITES_COLLECTION_ID = T.sites;
export const LIBRARY_COLLECTION_ID = T.library;
export const TEAMS_COLLECTION_ID = T.teams;
export const LIBRARY_CATEGORIES_COLLECTION_ID = T.libraryCategories;
export const LIBRARY_FAMILIES_COLLECTION_ID = T.libraryFamilies;
export const LIBRARY_COLLECTIONS_COLLECTION_ID = T.libraryCollections;
export const PLATFORM_SETTINGS_COLLECTION_ID = T.platformSettings;

export const TICKET_ACTIVITIES_COLLECTION_ID = T.ticketActivities;
export const TICKETS_COLLECTION_ID = T.tickets;
export const TICKET_MESSAGES_COLLECTION_ID = T.ticketMessages;

/** Storage bucket `$id`s — see `WPHUB_APPWRITE_IDS.buckets`. */
export const STORAGE_BUCKET_PLATFORM_ID = WPHUB_APPWRITE_IDS.buckets.platform;
export const STORAGE_BUCKET_BRIDGE_ID = WPHUB_APPWRITE_IDS.buckets.bridge;
export const STORAGE_BUCKET_AVATARS_ID = WPHUB_APPWRITE_IDS.buckets.avatars;
export const STORAGE_BUCKET_MEDIA_LIBRARY_ID = WPHUB_APPWRITE_IDS.buckets.mediaLibrary;

/** Default id for legacy contact / routing keys; not used for platform admin auth. Override with `APPWRITE_ADMIN_TEAM_ID`. */
export const ADMIN_TEAM_ID = envString('APPWRITE_ADMIN_TEAM_ID', 'admin');

/** Appwrite Function `$id`s — must match deployed function IDs in the Appwrite project. */
export const APPWRITE_FUNCTION_IDS = WPHUB_APPWRITE_IDS.functions;

export const COLLECTIONS = {
  SITES: SITES_COLLECTION_ID,
  LIBRARY: LIBRARY_COLLECTION_ID,
  TEAMS: TEAMS_COLLECTION_ID,
  LIBRARY_CATEGORIES: LIBRARY_CATEGORIES_COLLECTION_ID,
  LIBRARY_FAMILIES: LIBRARY_FAMILIES_COLLECTION_ID,
  LIBRARY_COLLECTIONS: LIBRARY_COLLECTIONS_COLLECTION_ID,
  PLATFORM_SETTINGS: PLATFORM_SETTINGS_COLLECTION_ID,
  ACCOUNTS: ACCOUNTS_COLLECTION_ID,
  TICKETS: TICKETS_COLLECTION_ID,
  TICKET_MESSAGES: TICKET_MESSAGES_COLLECTION_ID,
  TICKET_ACTIVITIES: TICKET_ACTIVITIES_COLLECTION_ID,
} as const;

export const STORAGE_BUCKETS = {
  PLATFORM: STORAGE_BUCKET_PLATFORM_ID,
  BRIDGE: STORAGE_BUCKET_BRIDGE_ID,
  AVATARS: STORAGE_BUCKET_AVATARS_ID,
  MEDIA_LIBRARY: STORAGE_BUCKET_MEDIA_LIBRARY_ID,
} as const;
