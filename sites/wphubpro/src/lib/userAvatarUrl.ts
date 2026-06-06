import { resolveUserAvatarImageUrl } from '@/domains/profile/avatarPrefs';
import { storage, STORAGE_BUCKET_AVATARS_ID } from '@/services/appwrite';
import type { PrefsRecord } from '@/domains/profile/profilePrefs';

/** Browser-side: resolves avatar URL (Dicebear, custom Appwrite file, or legacy `http` URL in prefs/accounts). */
export function getUserAvatarImageUrlForUi(args: {
  userId: string;
  prefs: PrefsRecord | null | undefined;
  /** Legacy: platform `accounts.avatar` and/or `prefs.avatar` as full URL. */
  legacyImageUrls?: (string | null | undefined)[];
}): string {
  return resolveUserAvatarImageUrl({
    userId: args.userId,
    prefs: args.prefs,
    getFileView: (bucket, fileId) => storage.getFileView(bucket, fileId),
    avatarsBucketId: STORAGE_BUCKET_AVATARS_ID,
    legacyImageUrls: args.legacyImageUrls,
  });
}
