import { Permission, Role, Query } from 'appwrite';

export type WorkspaceMode = 'personal' | 'team';

export function workspaceListFilter(mode: WorkspaceMode, userId: string, teamId: string | null) {
  if (mode === 'team' && teamId) return [Query.equal('team_id', teamId)];
  return [Query.equal('user_id', userId)];
}

export type LibraryListFilterOptions = {
  /** When true in team mode, also include rows owned by `userId` (personal library). */
  includePersonalLibraryInTeamWorkspace?: boolean;
};

/** List filters for `library`, `library_*` collections (supports admin personal-library merge in team mode). */
export function libraryListFilters(
  mode: WorkspaceMode,
  userId: string,
  teamId: string | null,
  options?: LibraryListFilterOptions,
) {
  if (mode === 'team' && teamId) {
    if (options?.includePersonalLibraryInTeamWorkspace) {
      return [
        Query.or([
          Query.equal('team_id', teamId),
          Query.equal('user_id', userId),
        ]),
      ];
    }
    return [Query.equal('team_id', teamId)];
  }
  return [Query.equal('user_id', userId)];
}

/** Document-level permissions for `library`, `library_*` rows (matches `functions/sites` site rows). */
export function workspaceDocumentPermissions(
  mode: WorkspaceMode,
  userId: string,
  teamId: string | null,
): string[] {
  if (mode === 'team' && teamId) {
    return [
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId, 'owner')),
      Permission.delete(Role.team(teamId, 'owner')),
    ];
  }
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

/** Ownership columns for team vs personal workspace. */
export function workspaceOwnerFields(
  mode: WorkspaceMode,
  userId: string,
  teamId: string | null,
): Record<string, unknown> {
  if (mode === 'team' && teamId) {
    return { team_id: teamId };
  }
  return { user_id: userId };
}
