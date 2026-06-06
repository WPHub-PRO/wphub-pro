export type ProfilePrefs = {
  website?: string;
  companyName?: string;
  country?: string;
  timezone?: string;
  language?: string;
  notifyEmail?: boolean;
  notifyPlatform?: boolean;
  /** When false, do not offer email MFA at sign-in (prefs only; Appwrite must expose email factor). */
  mfaFactorEmailEnabled?: boolean;
  /** When false, do not offer authenticator MFA at sign-in (prefs only; TOTP must be configured). */
  mfaFactorAuthenticatorEnabled?: boolean;
  /** `dicebear` = Bottts (default); `custom` = image in the Appwrite `avatars` bucket. */
  avatarSource?: 'dicebear' | 'custom';
  /** Bottts seed; when unset, the user id is used. */
  avatarBotttsSeed?: string;
  /** Appwrite Storage file `$id` in the `avatars` bucket. */
  avatarFileId?: string;
  /** Legacy: full image URL. Prefer `avatarFileId` and structured fields. */
  avatar?: string;
  /** Per-event in-app opt-out: key = template event_key or coarse type; `false` = disabled. */
  notificationEventPrefs?: Record<string, boolean>;
  /** Hide in-app rows older than this many days (unset = no age filter). */
  notificationRetentionDays?: number;
  /** Team `$id`s included in the topbar notification dropdown (prefs JSON). */
  wphub_topbar_notif_team_ids?: string[];
  /** Include personal-workspace notifications in the topbar dropdown. */
  wphub_topbar_notif_personal?: boolean;
  /** @deprecated Admins always merge personal library in team workspaces; kept for legacy prefs cleanup. */
  wphub_admin_use_personal_library_all_workspaces?: boolean;
};

/** Appwrite user prefs object (arbitrary JSON). */
export type PrefsRecord = Record<string, unknown>;

function parseEventPrefs(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseRetentionDays(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(3650, Math.max(1, Math.floor(n)));
}

export function parseProfilePrefs(prefs: PrefsRecord | undefined | null): ProfilePrefs {
  if (!prefs || typeof prefs !== 'object') return {};
  const p = prefs as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    website: typeof p.website === 'string' ? p.website : undefined,
    companyName: typeof p.companyName === 'string' ? p.companyName : undefined,
    country: typeof p.country === 'string' ? p.country : undefined,
    timezone: typeof p.timezone === 'string' ? p.timezone : undefined,
    language: typeof p.language === 'string' ? p.language : undefined,
    notifyEmail: p.notifyEmail === undefined ? undefined : bool(p.notifyEmail, true),
    notifyPlatform: p.notifyPlatform === undefined ? undefined : bool(p.notifyPlatform, true),
    mfaFactorEmailEnabled:
      p.mfaFactorEmailEnabled === undefined ? undefined : bool(p.mfaFactorEmailEnabled, true),
    mfaFactorAuthenticatorEnabled:
      p.mfaFactorAuthenticatorEnabled === undefined ? undefined : bool(p.mfaFactorAuthenticatorEnabled, true),
    avatarSource: p.avatarSource === 'dicebear' || p.avatarSource === 'custom' ? p.avatarSource : undefined,
    avatarBotttsSeed: typeof p.avatarBotttsSeed === 'string' ? p.avatarBotttsSeed : undefined,
    avatarFileId: typeof p.avatarFileId === 'string' ? p.avatarFileId : undefined,
    avatar: typeof p.avatar === 'string' ? p.avatar : undefined,
    notificationEventPrefs: parseEventPrefs(p.notificationEventPrefs),
    notificationRetentionDays: parseRetentionDays(p.notificationRetentionDays),
    wphub_admin_use_personal_library_all_workspaces:
      p.wphub_admin_use_personal_library_all_workspaces === true ? true : undefined,
  };
}

export function mergeProfilePrefs(existing: PrefsRecord | undefined | null, patch: Partial<ProfilePrefs>): PrefsRecord {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    base[k] = v;
  }
  return base;
}
