import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import { useTeamWorkspace } from '@/domains/teams';
import type { MenuItemType } from '@/types/layout';
import { useMemo } from 'react';
import { TbReceipt, TbSettings } from 'react-icons/tb';
import { useWorkspaceContext } from '@/domains/workspace/useWorkspaceContext';

const TEAMS_MENU_KEY = 'teams';

/**
 * When the active workspace is a team, replace the main nav "Teams" row with
 * "Your Team" linking to `/teams/:teamId` (members). Team owners also get "Team billing"
 * linking to `/teams/:teamId/billing`.
 */
export function useMemberNavMenuWithTeamWorkspace(items: MenuItemType[]): MenuItemType[] {
  const { mode, activeTeamId } = useWorkspaceContext();
  const { user } = useAuth();
  const teamId = activeTeamId?.trim() ?? '';
  const teamQ = useTeamWorkspace(Boolean(user) && mode === 'team' && Boolean(teamId), teamId || null);
  const data = teamQ.data;
  const showTeamBillingNav = Boolean(data?.isOwner && data?.accountKind !== 'team_member');
  const showTeamSettingsNav = showTeamBillingNav;

  return useMemo(() => {
    if (mode !== 'team' || !teamId) {
      return items;
    }
    return items.flatMap((item) => {
      if (item.key !== TEAMS_MENU_KEY) {
        return [item];
      }
      const yourTeam: MenuItemType = {
        ...item,
        label: 'Your Team',
        url: ROUTE_PATHS.teamPath(teamId),
        urlMatch: 'exact',
      };
      const out: MenuItemType[] = [yourTeam];
      if (showTeamSettingsNav) {
        out.push({
          key: 'team-settings',
          label: 'Team settings',
          icon: TbSettings,
          url: ROUTE_PATHS.teamSettingsPath(teamId),
        });
      }
      if (showTeamBillingNav) {
        out.push({
          key: 'team-billing',
          label: 'Team billing',
          icon: TbReceipt,
          url: ROUTE_PATHS.teamBillingPath(teamId),
        });
      }
      return out;
    });
  }, [items, mode, teamId, showTeamBillingNav, showTeamSettingsNav]);
}
