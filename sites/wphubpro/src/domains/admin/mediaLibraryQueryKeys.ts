import { STORAGE_BUCKET_MEDIA_LIBRARY_ID } from '@/services/appwrite'

/** Prefix for invalidating all media-library–related queries. */
export const mediaLibraryAdminQueryPrefix = ['admin', 'settings', 'media-library'] as const

/** TanStack key for `storage.listFiles` on the Appwrite `media_library` bucket (shared with settings UI). */
export const mediaLibraryFilesListQueryKey = [
  ...mediaLibraryAdminQueryPrefix,
  STORAGE_BUCKET_MEDIA_LIBRARY_ID,
] as const
