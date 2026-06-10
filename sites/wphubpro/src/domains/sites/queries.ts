import { Query } from 'appwrite';
import { workspaceListFilter, type WorkspaceMode } from '@/domains/workspace/queries';

export function siteDocAccessibleForSession(
  userId: string | undefined,
  siteDoc: { user_id?: string | null; team_id?: string | null },
  ws: {
    mode: string;
    activeTeamId: string | null;
    teamOwnerUserId?: string | null;
    teamWorkspaceReady?: boolean;
  },
): boolean {
  if (!userId) return false;
  const tid = siteDoc.team_id ? String(siteDoc.team_id).trim() : '';
  if (tid) {
    return ws.mode === 'team' && ws.activeTeamId === tid;
  }
  const uid = siteDoc.user_id ? String(siteDoc.user_id).trim() : '';
  if (!uid) return false;
  if (uid === userId) return true;
  if (ws.mode !== 'team' || !ws.teamWorkspaceReady) return false;
  const owner = String(ws.teamOwnerUserId ?? '').trim();
  return Boolean(owner && owner === uid);
}

export function sitesListQueries(
  mode: WorkspaceMode,
  userId: string,
  activeTeamId: string | null,
) {
  return [...workspaceListFilter(mode, userId, activeTeamId), Query.limit(100)];
}

/** Platform admins: personal sites + sites on any team they belong to (library install picker). */
export function sitesListQueriesForAdminInstall(userId: string, teamIds: string[]) {
  const filters: string[] = [];
  const uid = userId.trim();
  if (uid) filters.push(Query.equal('user_id', uid));
  for (const tid of teamIds) {
    const t = tid.trim();
    if (t) filters.push(Query.equal('team_id', t));
  }
  if (filters.length === 0) return [Query.limit(100)];
  if (filters.length === 1) return [filters[0], Query.limit(200)];
  return [Query.or(filters), Query.limit(200)];
}
