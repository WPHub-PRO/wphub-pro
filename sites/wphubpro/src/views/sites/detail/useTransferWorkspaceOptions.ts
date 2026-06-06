import type { TeamListRow } from '@/domains/teams';
import type { Site } from '@/types';
import type { TransferWorkspaceOption } from '@/views/sites/detail/TransferSiteWorkspaceModal';

/** Personal workspace + teams the user owns (can receive transferred sites). */
export function buildOwnedTransferWorkspaceOptions(teams: TeamListRow[] | undefined): TransferWorkspaceOption[] {
  const out: TransferWorkspaceOption[] = [{ id: 'personal', label: 'Personal workspace' }];
  for (const row of teams ?? []) {
    if (!row.isOwner) continue;
    const id = row.team.$id;
    const name = row.team.name?.trim() || id;
    out.push({ id, label: `Team: ${name}` });
  }
  return out;
}

export function siteWorkspaceMatchesView(
  site: Site,
  viewMode: 'personal' | 'team',
  activeTeamId: string | null,
): boolean {
  const siteTeam = site.teamId?.trim() ?? '';
  if (viewMode === 'team') {
    return Boolean(siteTeam) && siteTeam === (activeTeamId?.trim() ?? '');
  }
  return !siteTeam;
}

export function transferLeftCurrentWorkspaceView(
  choice: 'personal' | string,
  viewMode: 'personal' | 'team',
  activeTeamId: string | null,
): boolean {
  if (viewMode === 'personal') {
    return choice !== 'personal';
  }
  return choice === 'personal' || choice !== (activeTeamId?.trim() ?? '');
}
