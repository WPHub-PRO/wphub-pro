import { ROUTE_PATHS } from '@/config/routePaths';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import { useTeamWorkspace, useTeamsList } from '@/domains/teams';
import { useSetActiveWorkspace, useWorkspaceContext } from '@/domains/workspace';
import clsx from 'clsx';
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from 'react-bootstrap';
import { TbBuilding, TbUser, TbUserShield } from 'react-icons/tb';
import { useNavigate } from 'react-router';

export type WorkspaceSwitcherPlacement = 'sidebar' | 'topnav' | 'topbar';

type WorkspaceSwitcherProps = {
  placement?: WorkspaceSwitcherPlacement;
};

/**
 * Personal vs team workspace (`accounts.active_team_id`) and Admin workspace scope (`DashboardNavContext`).
 */
export default function WorkspaceSwitcher({ placement = 'sidebar' }: WorkspaceSwitcherProps) {
  const { user, isAdmin } = useAuth();
  const { showNotification } = useNotificationContext();
  const { mode: dashboardMode, setMode } = useDashboardNav();
  const navigate = useNavigate();
  const ws = useWorkspaceContext();
  const setWs = useSetActiveWorkspace();
  const teamsQ = useTeamsList(Boolean(user));

  const rows = teamsQ.data ?? [];
  /** Active team from account — source of truth for team workspace (do not fall back to `rows[0]`; that breaks multi-team after switching to personal). */
  const activeTeamId = ws.mode === 'team' ? ws.activeTeamId : null;

  const teamQ = useTeamWorkspace(Boolean(user) && Boolean(activeTeamId), activeTeamId);

  if (!user) return null;
  // Always show for signed-in users: Personal + optional teams (avoid hiding while list loads or when hub flags lag).

  const teamName = (teamQ.data?.team?.name || '').trim() || 'Team';
  const inAdminScope = dashboardMode === 'admin';
  const inTeamWorkspace = ws.mode === 'team';
  const personalActive = dashboardMode === 'user' && ws.mode === 'personal';
  const adminActive = inAdminScope;

  const toggleTitle = inAdminScope
    ? 'Workspace: Admin'
    : inTeamWorkspace
      ? `Workspace [${teamName}]`
      : 'Workspace: Personal';

  const align = placement === 'sidebar' || placement === 'topbar' ? 'start' : 'end';
  const menuAlignClass =
    placement === 'sidebar' || placement === 'topbar' ? '' : 'dropdown-menu-end';

  return (
    <div
      className={clsx('workspace-switcher-dropdown', {
        'workspace-switcher--sidebar': placement === 'sidebar',
        'workspace-switcher--topnav d-none d-lg-flex align-items-center flex-shrink-0': placement === 'topnav',
        'workspace-switcher--topbar d-flex align-items-center flex-shrink-0': placement === 'topbar',
      })}
    >
      {/* Keyboard-open only: avoids first row :focus (Bootstrap hover styling) while another row has .active. */}
      <Dropdown align={align} focusFirstItemOnShow="keyboard">
        <DropdownToggle
          variant="light"
          size="sm"
          type="button"
          className="border shadow-none d-flex align-items-center gap-2 workspace-switcher-toggle text-start"
          title={toggleTitle}
        >
          <span className="d-inline-flex align-items-center flex-shrink-0 text-body" aria-hidden>
            {inAdminScope ? <TbUserShield /> : inTeamWorkspace ? <TbBuilding /> : <TbUser />}
          </span>
          <span
            className="workspace-switcher__label small text-truncate min-w-0"
            style={{ maxWidth: placement === 'topnav' || placement === 'topbar' ? '16rem' : undefined }}
          >
            {inAdminScope ? (
              <>
                <span className="text-muted">Workspace:</span>{' '}
                <span className="fw-semibold text-body">Admin</span>
              </>
            ) : inTeamWorkspace ? (
              <>
                <span className="text-muted">Workspace</span>{' '}
                <span className="fw-semibold text-body">[{teamName}]</span>
              </>
            ) : (
              <>
                <span className="text-muted">Workspace:</span>{' '}
                <span className="fw-semibold text-body">Personal</span>
              </>
            )}
          </span>
        </DropdownToggle>
        <DropdownMenu className={clsx('workspace-switcher-menu topbar-dropdown-menu', menuAlignClass)}>
          <Dropdown.Header className="text-uppercase small text-muted">Workspace</Dropdown.Header>
          <DropdownItem
            as="button"
            type="button"
            active={personalActive}
            className="workspace-switcher-item d-flex align-items-center gap-2 text-start flex-nowrap"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMode('user');
              void setWs.mutateAsync(null).catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : 'Could not switch workspace.';
                showNotification({ title: 'Workspace', message: msg, variant: 'danger' });
              });
            }}
            disabled={setWs.isPending}
          >
            <TbUser className="fs-17 flex-shrink-0" aria-hidden />
            <span className="text-truncate min-w-0">Personal</span>
          </DropdownItem>
          {rows.flatMap((row) => {
            const id = String(row.team.$id || '').trim();
            if (!id) return [];
            const label = (row.team.name || '').trim() || 'Team';
            const isThisTeam =
              dashboardMode === 'user' && ws.mode === 'team' && ws.activeTeamId === id;
            return [
              <DropdownItem
                key={id}
                as="button"
                type="button"
                active={isThisTeam}
                className="workspace-switcher-item d-flex align-items-center gap-2 text-start flex-nowrap"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMode('user');
                  void setWs.mutateAsync(id).catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : 'Could not switch workspace.';
                    showNotification({ title: 'Workspace', message: msg, variant: 'danger' });
                  });
                }}
                disabled={setWs.isPending}
              >
                <TbBuilding className="fs-17 flex-shrink-0" aria-hidden />
                <span className="text-truncate min-w-0" title={label}>
                  {label}
                </span>
              </DropdownItem>,
            ];
          })}
          {isAdmin ? (
            <>
              {rows.length > 0 ? <Dropdown.Divider /> : null}
              <DropdownItem
                as="button"
                type="button"
                active={adminActive}
                className="workspace-switcher-item d-flex align-items-center gap-2 text-start flex-nowrap"
                onClick={() => {
                  setMode('admin');
                  navigate(ROUTE_PATHS.ADMIN_DASHBOARD);
                }}
              >
                <TbUserShield className="fs-17 flex-shrink-0" aria-hidden />
                <span className="text-truncate min-w-0">Admin</span>
              </DropdownItem>
            </>
          ) : null}
        </DropdownMenu>
      </Dropdown>
    </div>
  );
}
