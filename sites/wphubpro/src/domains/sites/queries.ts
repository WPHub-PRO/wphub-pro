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
