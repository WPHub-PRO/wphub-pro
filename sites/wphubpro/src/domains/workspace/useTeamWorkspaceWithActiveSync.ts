import { useDashboardNav } from '@/context/DashboardNavContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import { useTeamWorkspace } from '@/domains/teams';
import { useSetActiveWorkspace, useWorkspaceContext } from '@/domains/workspace/useWorkspaceContext';
import { useEffect } from 'react';

/**
 * Loads team workspace data and switches the active Appwrite/platform workspace to this team when the row is available.
 */
export function useTeamWorkspaceWithActiveSync(teamId: string | null) {
  const { user } = useAuth();
  const { setMode } = useDashboardNav();
  const { showNotification } = useNotificationContext();
  const ws = useWorkspaceContext();
  const setWs = useSetActiveWorkspace();
  const tid = teamId?.trim() ?? '';
  const teamQ = useTeamWorkspace(Boolean(user) && Boolean(tid), tid || null);

  useEffect(() => {
    if (!user?.$id || !tid) return;
    if (teamQ.isLoading || teamQ.isError) return;
    if (!teamQ.data?.team) return;
    if (ws.activeTeamId === tid) return;
    if (setWs.isPending) return;

    setMode('user');
    void setWs.mutateAsync({ activeTeamId: tid, skipDashboardRedirect: true }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not switch workspace.';
      showNotification({ title: 'Workspace', message: msg, variant: 'danger' });
    });
  }, [
    tid,
    teamQ.data?.team,
    teamQ.isError,
    teamQ.isLoading,
    setMode,
    setWs,
    showNotification,
    user?.$id,
    ws.activeTeamId,
  ]);

  return teamQ;
}
