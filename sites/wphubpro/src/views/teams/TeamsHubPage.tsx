import ComponentCard from '@/components/cards/ComponentCard';
import { TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS } from '@/components/table/tableActionClasses';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import { useFinalizeTeamCheckoutMutation, useTeamsList, type TeamListRow } from '@/domains/teams';
import { useSetActiveWorkspace, useWorkspaceContext } from '@/domains/workspace';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import { isInteractiveTableRowClickTarget } from '@/lib/isInteractiveTableRowClickTarget';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Alert, Button, Col, Container, Row, Spinner, Table } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router';
import { LuSearch, LuTag } from 'react-icons/lu';
import { TbListDetails, TbUsersPlus } from 'react-icons/tb';
import TeamCreateModal from '@/views/teams/TeamCreateModal';

function functionErrorMessage(err: unknown): string {
  if (err instanceof AppwriteFunctionError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

type TeamRoleFilter = 'all' | 'owner' | 'member';

function teamMatchesSearch(r: TeamListRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const nameHit = String(r.team.name ?? '')
    .toLowerCase()
    .includes(needle);
  const idHit = String(r.team.$id ?? '')
    .toLowerCase()
    .includes(needle);
  const roleLabel = r.isOwner ? 'owner' : 'member';
  return nameHit || idHit || roleLabel.includes(needle);
}

function teamMatchesRoleFilter(r: TeamListRow, role: TeamRoleFilter): boolean {
  switch (role) {
    case 'all':
      return true;
    case 'owner':
      return r.isOwner;
    case 'member':
      return !r.isOwner;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export default function TeamsHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setMode } = useDashboardNav();
  const { showNotification } = useNotificationContext();
  const ws = useWorkspaceContext();
  const setWs = useSetActiveWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<TeamRoleFilter>('all');
  const listQ = useTeamsList(Boolean(user));
  const finalizeCheckout = useFinalizeTeamCheckoutMutation();

  const openTeamDetail = useCallback(
    async (rawTeamId: string) => {
      const id = String(rawTeamId || '').trim();
      if (!id) return;
      if (setWs.isPending || finalizeCheckout.isPending) return;
      setMode('user');
      if (ws.activeTeamId === id) {
        navigate(ROUTE_PATHS.teamPath(id));
        return;
      }
      try {
        await setWs.mutateAsync({ activeTeamId: id, skipDashboardRedirect: true });
        navigate(ROUTE_PATHS.teamPath(id));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not switch workspace.';
        showNotification({ title: 'Workspace', message: msg, variant: 'danger' });
      }
    },
    [
      finalizeCheckout.isPending,
      navigate,
      setMode,
      setWs,
      showNotification,
      ws.activeTeamId,
    ],
  );

  useEffect(() => {
    const ok = searchParams.get('team_checkout');
    const sid = searchParams.get('session_id');
    if (ok !== 'success' || !sid || sid.includes('{')) return;

    const doneKey = `wphub_team_finalize_done_${sid}`;
    const runKey = `wphub_team_finalize_run_${sid}`;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(doneKey)) {
        const next = new URLSearchParams(searchParams);
        next.delete('team_checkout');
        next.delete('session_id');
        setSearchParams(next, { replace: true });
        return;
      }
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(runKey)) return;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(runKey, '1');
    } catch {
      /* ignore */
    }

    finalizeCheckout.mutate(sid, {
      onSuccess: () => {
        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(doneKey, '1');
            sessionStorage.removeItem(runKey);
          }
        } catch {
          /* ignore */
        }
      },
      onError: () => {
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(runKey);
        } catch {
          /* ignore */
        }
      },
      onSettled: () => {
        const next = new URLSearchParams(searchParams);
        next.delete('team_checkout');
        next.delete('session_id');
        setSearchParams(next, { replace: true });
      },
    });
  }, [searchParams, setSearchParams, finalizeCheckout]);

  const allRows = listQ.data ?? [];
  const filteredRows = useMemo(
    () => allRows.filter((r) => teamMatchesSearch(r, teamSearch) && teamMatchesRoleFilter(r, roleFilter)),
    [allRows, roleFilter, teamSearch],
  );

  if (!user) return null;

  const newTeamDisabled = finalizeCheckout.isPending;

  return (
    <>
      <PageMetaData title="Teams" />
      <Container fluid>
        <PageBreadcrumb title="Teams" subtitle="Your workspaces" />

        {finalizeCheckout.isPending ? (
          <Alert variant="info" className="shadow-sm mb-3">
            Completing team setup from checkout…
          </Alert>
        ) : null}
        {finalizeCheckout.isError ? (
          <Alert variant="danger" className="shadow-sm mb-3">
            {functionErrorMessage(finalizeCheckout.error)}
          </Alert>
        ) : null}

        {listQ.isLoading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" role="status" variant="primary">
              <span className="visually-hidden">Loading…</span>
            </Spinner>
          </div>
        ) : null}

        {listQ.error ? (
          <Alert variant="warning" className="shadow-sm">
            <strong>Could not load teams.</strong> <span className="text-body">{functionErrorMessage(listQ.error)}</span>
          </Alert>
        ) : null}

        {!listQ.isLoading && !listQ.error ? (
          <Row className="g-3">
            <Col xs={12} className="d-flex">
              <ComponentCard
                className="w-100"
                title="Teams"
                titleExtra={
                  <span className="badge badge-label badge-soft-secondary fs-xxs">{allRows.length} total</span>
                }
                headerActions={
                  <>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      type="button"
                      onClick={() => void listQ.refetch()}
                      disabled={listQ.isFetching}
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      className="text-nowrap"
                      onClick={() => setCreateModalOpen(true)}
                      disabled={newTeamDisabled}
                    >
                      <TbUsersPlus className="me-1" aria-hidden />
                      New team
                    </Button>
                  </>
                }
                bodyClassName="p-0 d-flex flex-column flex-grow-1 min-h-0"
              >
                <div className="d-flex flex-column flex-grow-1 min-h-0">
                  <div className="border-bottom border-light flex-shrink-0">
                    <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3 w-100 p-3 pb-2">
                      <div className="app-search flex-grow-1" style={{ minWidth: '10rem', maxWidth: '22rem' }}>
                        <input
                          type="search"
                          className="form-control"
                          placeholder="Search name or ID…"
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                          aria-label="Search teams"
                        />
                        <LuSearch className="app-search-icon text-muted" />
                      </div>

                      <span className="me-1 fw-semibold d-none d-md-inline text-muted small">Filter</span>

                      <div className="app-search">
                        <select
                          className="form-select form-control"
                          aria-label="Filter by role"
                          value={roleFilter}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'all' || v === 'owner' || v === 'member') setRoleFilter(v);
                          }}
                        >
                          <option value="all">Role</option>
                          <option value="owner">Owner</option>
                          <option value="member">Member</option>
                        </select>
                        <LuTag className="app-search-icon text-muted" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-grow-1 min-h-0 overflow-auto">
                    {allRows.length === 0 ? (
                      <p className="text-muted text-center py-5 mb-0 px-3">
                        You are not in any team yet. Create one to get started.
                      </p>
                    ) : filteredRows.length === 0 ? (
                      <p className="text-muted text-center py-5 mb-0 px-3">No teams match your filters.</p>
                    ) : (
                      <div className="p-3">
                        <div className="table-responsive border rounded">
                          <Table hover className="table table-custom table-centered table-nowrap mb-0 align-middle">
                            <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                              <tr className="text-uppercase fs-xxs">
                                <th scope="col">Name</th>
                                <th scope="col">Role</th>
                                <th scope="col">Members</th>
                                <th scope="col" className="text-end">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredRows.map((r) => {
                                const teamId = String(r.team.$id || '').trim();
                                const membersLabel =
                                  r.isOwner && r.seatTotal != null && r.seatTotal > 0
                                    ? `${r.seatsUsed} / ${r.seatTotal}`
                                    : `${r.seatsUsed} member${r.seatsUsed === 1 ? '' : 's'}`;
                                const busy = setWs.isPending || finalizeCheckout.isPending;
                                const handleRowClick = (e: MouseEvent<HTMLTableRowElement>) => {
                                  if (busy) return;
                                  if (isInteractiveTableRowClickTarget(e.target)) return;
                                  void openTeamDetail(teamId);
                                };

                                const handleRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
                                  if (busy) return;
                                  if (e.key !== 'Enter' && e.key !== ' ') return;
                                  if (isInteractiveTableRowClickTarget(e.target)) return;
                                  e.preventDefault();
                                  void openTeamDetail(teamId);
                                };

                                return (
                                  <tr
                                    key={r.team.$id}
                                    tabIndex={busy ? -1 : 0}
                                    className={busy ? undefined : 'cursor-pointer'}
                                    onClick={handleRowClick}
                                    onKeyDown={handleRowKeyDown}
                                  >
                                    <td>
                                      <div className="fw-medium">{r.team.name}</div>
                                      <div className="text-muted fs-xs font-monospace text-break">{r.team.$id}</div>
                                    </td>
                                    <td className="text-nowrap">{r.isOwner ? 'Owner' : 'Member'}</td>
                                    <td className="text-nowrap">{membersLabel}</td>
                                    <td className="text-end text-nowrap">
                                      <Button
                                        type="button"
                                        variant="outline-primary"
                                        size="sm"
                                        className={TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS}
                                        disabled={busy}
                                        aria-busy={busy}
                                        aria-label={`Open team ${r.team.name}`}
                                        title={`Open team ${r.team.name}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void openTeamDetail(teamId);
                                        }}
                                      >
                                        <TbListDetails className="fs-lg" aria-hidden />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </ComponentCard>
            </Col>
          </Row>
        ) : null}
      </Container>
      <TeamCreateModal show={createModalOpen} onHide={() => setCreateModalOpen(false)} />
    </>
  );
}
