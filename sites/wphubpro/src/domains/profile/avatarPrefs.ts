import { getDicebearBotttsSvgUrl } from '@/config/dicebearBottts';
import type { ProfilePrefs, PrefsRecord } from './profilePrefs';
import { parseProfilePrefs } from './profilePrefs';

export type AvatarSource = 'dicebear' | 'custom';

export function getEffectiveBotttsSeed(prefs: ProfilePrefs, userId: string): string {
  if (typeof prefs.avatarBotttsSeed === 'string' && prefs.avatarBotttsSeed.trim()) {
    return prefs.avatarBotttsSeed.trim();
  }
  return userId;
}

const LEGACY_URL = /^https?:\/\//i;

function firstLegacyImageUrl(legacy: (string | null | undefined)[] | undefined): string | null {
  if (!legacy) return null;
  for (const s of legacy) {
    if (typeof s === 'string' && s.trim() && LEGACY_URL.test(s.trim())) return s.trim();
  }
  return null;
}

/**
 * Resolves a display URL for a user's avatar: optional legacy URLs, then Appwrite `avatars` file, then Bottts.
 * Always returns a string (Dicebear is the universal fallback).
 */
export function resolveUserAvatarImageUrl(args: {
  userId: string;
  prefs: PrefsRecord | null | undefined;
  getFileView: (bucketId: string, fileId: string) => string;
  avatarsBucketId: string;
  /** e.g. `prefs.avatar` or `accounts.avatar` if they stored a public URL. */
  legacyImageUrls?: (string | null | undefined)[];
}): string {
  const { userId, prefs, getFileView, avatarsBucketId, legacyImageUrls } = args;
  const fromLegacy = firstLegacyImageUrl(legacyImageUrls);
  if (fromLegacy) return fromLegacy;

  const p = parseProfilePrefs(prefs as never);

  if (p.avatarSource === 'custom' && typeof p.avatarFileId === 'string' && p.avatarFileId.trim()) {
    return getFileView(avatarsBucketId, p.avatarFileId.trim());
  }

  const rawPref = prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as PrefsRecord).avatar : undefined;
  if (typeof rawPref === 'string' && rawPref.trim() && LEGACY_URL.test(rawPref.trim())) {
    return rawPref.trim();
  }

  return getDicebearBotttsSvgUrl(getEffectiveBotttsSeed(p, userId));
}
