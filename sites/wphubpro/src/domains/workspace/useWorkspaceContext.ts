import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import { useMyAccountDoc } from '@/domains/profile/useMyAccountDoc';
import { useTeamWorkspace } from '@/domains/teams/useTeamWorkspace';
import type { WorkspaceMode } from '@/domains/workspace/workspaceRowPermissions';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type { WorkspaceMode };

type SetActiveTeamResponse = {
  success?: boolean;
  message?: string;
  active_team_id?: string | null;
};

/** `string | null` = switch workspace and go to dashboard (existing behavior). */
export type SetActiveWorkspaceInput =
  | string
  | null
  | { activeTeamId: string | null; skipDashboardRedirect?: boolean };

function parseSetActiveWorkspaceInput(input: SetActiveWorkspaceInput): {
  teamId: string | null;
  skipDashboardRedirect: boolean;
} {
  if (input !== null && typeof input === 'object' && 'activeTeamId' in input) {
    return {
      teamId: input.activeTeamId,
      skipDashboardRedirect: Boolean(input.skipDashboardRedirect),
    };
  }
  return { teamId: input as string | null, skipDashboardRedirect: false };
}

export function useWorkspaceContext() {
  const { user } = useAuth();
  const accountQ = useMyAccountDoc(user?.$id);
  const acc = accountQ.data;
  const activeTeamIdStored = acc?.active_team_id?.trim() || null;
  const mode: WorkspaceMode = activeTeamIdStored ? 'team' : 'personal';
  const teamWsEnabled = mode === 'team' && Boolean(activeTeamIdStored);
  const teamWsQ = useTeamWorkspace(teamWsEnabled, activeTeamIdStored);
  /** Canonical owner Auth user id from `users` team-get (`platform_db.teams.owner_id`). */
  const teamOwnerUserId = teamWsEnabled
    ? String(teamWsQ.data?.ownerUserId ?? '').trim() || null
    : null;
  const teamWorkspaceReady = !teamWsEnabled || !teamWsQ.isPending;
  const workspaceQueryKey =
    mode === 'team' && activeTeamIdStored
      ? `team:${activeTeamIdStored}:${teamWorkspaceReady ? teamOwnerUserId || 'none' : 'pending'}`
      : 'personal';

  return {
    ...accountQ,
    accountDoc: acc,
    mode,
    activeTeamId: mode === 'team' ? activeTeamIdStored : null,
    /** Last or current team id from `accounts.active_team_id` (Appwrite membership is source of truth). */
    membershipTeamId: activeTeamIdStored,
    teamOwnerUserId,
    /** Team workspace (`team-get`) finished loading so `teamOwnerUserId` is meaningful when in team mode. */
    teamWorkspaceReady,
    workspaceQueryKey,
  };
}

export function useSetActiveWorkspace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();

  return useMutation<SetActiveTeamResponse, Error, SetActiveWorkspaceInput>({
    mutationFn: async (input) => {
      if (!user?.$id) throw new Error('Not signed in.');
      const { teamId: nextTeamId } = parseSetActiveWorkspaceInput(input);
      const trimmed = nextTeamId?.trim() || '';
      const payload =
        trimmed.length > 0
          ? { action: 'set-active-team' as const, activeTeamId: trimmed }
          : { action: 'set-active-team' as const, activeTeamId: null as string | null };

      const data = await executeFunction<SetActiveTeamResponse>(APPWRITE_FUNCTION_IDS.USERS, payload);

      if (!data?.success) {
        throw new Error(
          typeof data?.message === 'string' ? data.message : 'Could not update workspace.',
        );
      }
      return data;
    },
    onSuccess: (data, input) => {
      if (user?.$id) {
        const raw = data?.active_team_id;
        const nextActive =
          raw === null || raw === undefined ? null : String(raw).trim() || null;
        queryClient.setQueryData(['my-account-doc', user.$id], (prev) => {
          if (prev == null) return prev;
          return { ...prev, active_team_id: nextActive };
        });
        void queryClient.invalidateQueries({ queryKey: ['my-account-doc', user.$id] });
        void queryClient.invalidateQueries({ queryKey: ['team', 'workspace'] });
        void queryClient.invalidateQueries({ queryKey: ['team', 'list'] });
        void queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            (q.queryKey[0] === 'sites' ||
              q.queryKey[0] === 'libraryItems' ||
              q.queryKey[0] === 'libraryCollections' ||
              q.queryKey[0] === 'libraryFamilies' ||
              q.queryKey[0] === 'libraryCategories') &&
            q.queryKey[1] === user.$id,
        });
      }
      const { skipDashboardRedirect } = parseSetActiveWorkspaceInput(input);
      if (!skipDashboardRedirect) {
        navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
      }
    },
  });
}
