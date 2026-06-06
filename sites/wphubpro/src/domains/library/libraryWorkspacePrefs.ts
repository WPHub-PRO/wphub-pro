import { useAuth } from '@/domains/auth';
import type { PrefsRecord } from '@/domains/profile/profilePrefs';

/** Appwrite user pref: include personal `library` rows while in a team workspace (admins only). */
export const ADMIN_PERSONAL_LIBRARY_ALL_WORKSPACES_PREF =
  'wphub_admin_use_personal_library_all_workspaces' as const;

export type AdminLibraryWorkspacePrefs = {
  usePersonalLibraryInAllWorkspaces: boolean;
};

export function parseAdminLibraryWorkspacePrefs(
  prefs: PrefsRecord | undefined | null,
): AdminLibraryWorkspacePrefs {
  if (!prefs || typeof prefs !== 'object') {
    return { usePersonalLibraryInAllWorkspaces: false };
  }
  const raw = prefs[ADMIN_PERSONAL_LIBRARY_ALL_WORKSPACES_PREF];
  return { usePersonalLibraryInAllWorkspaces: raw === true };
}

/** True for platform admins: personal library rows are merged in every team workspace. */
export function useAdminPersonalLibraryInAllWorkspaces(): boolean {
  const { user, isAdmin } = useAuth();
  return Boolean(isAdmin && user);
}
