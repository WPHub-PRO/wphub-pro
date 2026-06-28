import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { TABLE_ACTION_ICON_DANGER_CLASS } from '@/components/table/tableActionClasses';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import {
  countOccupiedSeats,
  useTeamDeleteMutation,
  useTeamHandoverMutation,
  useTeamInviteMutation,
  useTeamLeaveMutation,
  useTeamRemoveMemberMutation,
  type TeamMemberRow,
} from '@/domains/teams';
import { useSetActiveWorkspace, useTeamWorkspaceWithActiveSync, useWorkspaceContext } from '@/domains/workspace';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Container, Form, Row, Spinner, Table } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'
import { Link, useNavigate, useParams } from 'react-router';
import { TbUserMinus, TbUserPlus } from 'react-icons/tb';
import TeamDetailsSidebarCard from '@/views/teams/TeamDetailsSidebarCard';
import { TeamPendingInvitesSection } from '@/views/teams/TeamPendingInvitesSection';

function memberLabel(m: TeamMemberRow): string {
  if (m.name?.trim()) return m.name.trim();
  if (m.email?.trim()) return m.email.trim();
  return m.userId;
}

function functionErrorMessage(err: unknown): string {
  if (err instanceof AppwriteFunctionError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export default function TeamDetailPage() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const teamId = teamIdParam?.trim() ?? '';
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();
  const ws = useWorkspaceContext();
  const setWs = useSetActiveWorkspace();
  const teamQ = useTeamWorkspaceWithActiveSync(teamId || null);
  const navigate = useNavigate();
  const inviteMember = useTeamInviteMutation(teamId || null);
  const removeMember = useTeamRemoveMemberMutation(teamId || null);
  const leaveTeam = useTeamLeaveMutation(teamId || null);
  const handoverTeam = useTeamHandoverMutation(teamId || null);
  const deleteTeam = useTeamDeleteMutation(teamId || null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverTargetId, setHandoverTargetId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const data = teamQ.data;
  const isMemberOnly = data?.accountKind === 'team_member';
  const isOwner = Boolean(data?.isOwner);
  const seatsUsed = data ? countOccupiedSeats(data.members) : 0;
  const seatTotal = data?.seatTotal ?? null;

  const hasTeamStripeBilling = Boolean(data?.team?.$id && data.stripeCustomerIdTeam);
  const canInvite = Boolean(data?.team && isOwner && !isMemberOnly);
  const canLeaveTeam = Boolean(data?.team && !isOwner);
  const canOwnerDanger = Boolean(data?.team && isOwner && !isMemberOnly);

  const handoverCandidates = useMemo(
    () => (data?.members ?? []).filter((m) => m.userId !== user?.$id),
    [data?.members, user?.$id],
  );

  if (!user) return null;

  const membersManagementPane = data?.team ? (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h5 className="mb-0">Members</h5>
        {canInvite ? (
          <span className="text-muted small d-flex align-items-center gap-1">
            <TbUserPlus aria-hidden />
            Invite by email
          </span>
        ) : null}
      </div>

      {canInvite ? (
        <p className="text-muted small mb-2">
          Invites stay pending until the recipient accepts the link in the invitation email. They can join with a new
          account or an existing one.
        </p>
      ) : null}

      {canInvite ? (
        <Form
          className="d-flex flex-wrap gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            inviteMember.mutate(
              {
                email: inviteEmail,
              },
              { onSuccess: () => setInviteEmail('') },
            );
          }}
        >
          <Form.Control
            type="email"
            className="flex-grow-1"
            style={{ minWidth: '220px', maxWidth: '360px' }}
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviteMember.isPending}
          />
          <Button type="submit" variant="primary" size="sm" disabled={inviteMember.isPending}>
            {inviteMember.isPending ? 'Sending…' : 'Send invite'}
          </Button>
        </Form>
      ) : null}
      {inviteMember.error ? (
        <p className="text-danger small mb-3">{functionErrorMessage(inviteMember.error)}</p>
      ) : null}

      <TeamPendingInvitesSection teamId={data.team.$id} enabled={canInvite} />

      <div className="table-responsive border rounded">
        <Table hover className="table table-custom table-centered table-nowrap mb-0 align-middle" size="sm">
          <thead className="bg-light align-middle bg-opacity-25 thead-sm">
            <tr className="text-uppercase fs-xxs">
              <th>Member</th>
              <th>User ID</th>
              {isOwner && !isMemberOnly ? <th className="text-end">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.members.length === 0 ? (
              <tr>
                <td colSpan={isOwner && !isMemberOnly ? 3 : 2} className="text-muted text-center py-4">
                  No members yet.
                </td>
              </tr>
            ) : null}
            {data.members.map((m) => {
              const isSelf = m.userId === user.$id;
              const canRemove = isOwner && !isMemberOnly && !isSelf;
              return (
                <tr key={m.userId}>
                  <td>{memberLabel(m)}</td>
                  <td className="font-monospace small text-muted">{m.userId}</td>
                  {isOwner && !isMemberOnly ? (
                    <td className="text-end">
                      {canRemove ? (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          className={TABLE_ACTION_ICON_DANGER_CLASS}
                          onClick={() => setRemoveTarget(m)}
                          disabled={removeMember.isPending}
                          aria-label={`Remove ${memberLabel(m)} from team`}
                          title={`Remove ${memberLabel(m)} from team`}
                        >
                          <TbUserMinus className="fs-lg" aria-hidden />
                        </Button>
                      ) : (
                        <span className="text-muted small">{isSelf ? 'You' : ''}</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
    ) : null;

  if (!teamId) {
    return (
      <Container fluid>
        <Alert variant="danger">Missing team id.</Alert>
      </Container>
    );
  }

  return (
    <>
      <PageMetaData title={data?.team?.name ? `${data.team.name} · Team` : 'Team'} />
      <PageBreadcrumb
        title={data?.team?.name ?? 'Team'}
        subtitle="Members and seats"
        titleEnd={
          <Link to={ROUTE_PATHS.TEAMS} className="btn btn-outline-secondary btn-sm">
            All teams
          </Link>
        }
      />
      <Container fluid>
        {teamQ.isLoading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" role="status" variant="primary" />
          </div>
        ) : null}

        {teamQ.error ? (
          <Alert variant="warning" className="shadow-sm">
            <strong>Could not load team.</strong>{' '}
            <span className="text-body">{functionErrorMessage(teamQ.error)}</span>
          </Alert>
        ) : null}

        {!teamQ.isLoading && !teamQ.error && data && !data.team ? (
          <Alert variant="secondary">You do not have access to this team or it does not exist.</Alert>
        ) : null}

        {!teamQ.isLoading && !teamQ.error && data?.team ? (
          <Row className="justify-content-center">
            <Col xxl={12}>
              <Row>
                <Col xl={9}>
                  <Card className="mb-3 shadow-sm">
                    <Card.Body className="pb-0 border-bottom border-light">
                      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                        <div>
                          <p className="text-muted text-uppercase fs-xs fw-semibold mb-1">Team</p>
                          <h4 className="mb-0">{data.team.name}</h4>
                          <p className="text-muted small mb-0 mt-2 font-monospace">ID: {data.team.$id}</p>
                        </div>
                        <div className="text-start text-md-end">
                          <p className="text-muted text-uppercase fs-xs fw-semibold mb-1">Seats</p>
                          <p className="fs-4 fw-semibold mb-0">
                            {seatsUsed}
                            {isOwner && !isMemberOnly && seatTotal != null && seatTotal > 0 ? (
                              <span className="text-muted fs-6 fw-normal"> / {seatTotal}</span>
                            ) : (
                              <span className="text-muted fs-6 fw-normal"> used</span>
                            )}
                          </p>
                          {isOwner && !isMemberOnly ? (
                            <p className="small text-muted mb-0 mt-2">Invite colleagues up to your purchased limit.</p>
                          ) : null}
                        </div>
                      </div>
                    </Card.Body>
                    <Card.Body className="pt-4 pb-4">
                      {isOwner && !isMemberOnly && !hasTeamStripeBilling ? (
                        <Alert variant="light" className="border shadow-sm">
                          <p className="fs-sm mb-2">
                            Team billing is not linked to Stripe yet. Start team checkout from the teams hub to subscribe and allocate seats.
                          </p>
                          <Link to={ROUTE_PATHS.TEAMS} className="btn btn-sm btn-primary mt-2">
                            Go to teams hub
                          </Link>
                        </Alert>
                      ) : null}

                      {isOwner && !isMemberOnly && hasTeamStripeBilling ? (
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
                          <p className="text-muted small mb-0">
                            Subscription, invoices, and payment methods are on the team billing page.
                          </p>
                          <Link to={ROUTE_PATHS.teamBillingPath(teamId)} className="btn btn-primary btn-sm">
                            Team billing
                          </Link>
                        </div>
                      ) : null}

                      {membersManagementPane}
                    </Card.Body>
                  </Card>

                  {canLeaveTeam || canOwnerDanger ? (
                    <Card className="mb-3 shadow-sm border-danger-subtle">
                      <Card.Body>
                        <h5 className="mb-3 text-danger">Team actions</h5>
                        {canLeaveTeam ? (
                          <p className="small text-muted mb-2">
                            Leave removes your membership. Owners must transfer ownership first, then leave as a member.
                          </p>
                        ) : null}
                        <div className="d-flex flex-wrap gap-2">
                          {canLeaveTeam ? (
                            <Button variant="outline-danger" size="sm" onClick={() => setLeaveOpen(true)}>
                              Leave team
                            </Button>
                          ) : null}
                          {canOwnerDanger ? (
                            <>
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => {
                                  const first = handoverCandidates[0]?.userId ?? '';
                                  setHandoverTargetId(first);
                                  setHandoverOpen(true);
                                }}
                                disabled={handoverCandidates.length === 0}
                              >
                                Transfer ownership
                              </Button>
                              <Button variant="outline-danger" size="sm" onClick={() => setDeleteOpen(true)}>
                                Delete team
                              </Button>
                            </>
                          ) : null}
                        </div>
                        {canOwnerDanger && handoverCandidates.length === 0 ? (
                          <p className="small text-muted mb-0 mt-2">Invite another member before you can transfer ownership.</p>
                        ) : null}
                      </Card.Body>
                    </Card>
                  ) : null}
                </Col>

                <Col xl={3}>
                  <TeamDetailsSidebarCard
                    teamId={data.team.$id}
                    teamName={data.team.name}
                    memberCount={data.members.length}
                    seatsUsed={seatsUsed}
                    seatTotal={isOwner && !isMemberOnly ? seatTotal : null}
                    isOwner={isOwner}
                    isMemberOnly={isMemberOnly}
                    hasBilling={hasTeamStripeBilling}
                  />
                </Col>
              </Row>
            </Col>
          </Row>
        ) : null}
      </Container>

      <Modal show={removeTarget != null} onHide={() => setRemoveTarget(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Remove member</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {removeTarget ? (
            <>
              Remove <strong>{memberLabel(removeTarget)}</strong> from the team? This may delete their platform user
              account, depending on server configuration.
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setRemoveTarget(null)} disabled={removeMember.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={removeMember.isPending || !removeTarget}
            onClick={() => {
              if (!removeTarget) return;
              removeMember.mutate(removeTarget.userId, {
                onSuccess: () => setRemoveTarget(null),
              });
            }}
          >
            {removeMember.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={leaveOpen} onHide={() => !leaveTeam.isPending && setLeaveOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Leave team</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          You will lose access to this team workspace. If this is your active workspace, we will switch you back to
          personal mode.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setLeaveOpen(false)} disabled={leaveTeam.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={leaveTeam.isPending}
            onClick={() => {
              leaveTeam.mutate(undefined, {
                onSuccess: async () => {
                  setLeaveOpen(false);
                  if (ws.activeTeamId === teamId) {
                    try {
                      await setWs.mutateAsync({ activeTeamId: null, skipDashboardRedirect: true });
                    } catch (err: unknown) {
                      showNotification({
                        title: 'Workspace',
                        message: functionErrorMessage(err),
                        variant: 'danger',
                        delay: 4000,
                      });
                    }
                  }
                  navigate(ROUTE_PATHS.TEAMS);
                },
                onError: (err: unknown) => {
                  showNotification({
                    title: 'Leave team',
                    message: functionErrorMessage(err),
                    variant: 'danger',
                    delay: 5000,
                  });
                },
              });
            }}
          >
            {leaveTeam.isPending ? 'Leaving…' : 'Leave team'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={handoverOpen} onHide={() => !handoverTeam.isPending && setHandoverOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Transfer ownership</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">
            The selected member becomes the team owner and billing contact. You stay on the team as a member unless you
            leave afterward.
          </p>
          <Form.Group className="mb-0">
            <Form.Label>New owner</Form.Label>
            <Form.Select
              value={handoverTargetId}
              onChange={(e) => setHandoverTargetId(e.target.value)}
              disabled={handoverTeam.isPending || handoverCandidates.length === 0}
            >
              {handoverCandidates.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {memberLabel(m)} ({m.userId})
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setHandoverOpen(false)} disabled={handoverTeam.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={handoverTeam.isPending || !handoverTargetId}
            onClick={() => {
              handoverTeam.mutate(handoverTargetId, {
                onSuccess: () => {
                  setHandoverOpen(false);
                  showNotification({
                    title: 'Team',
                    message: 'Ownership transferred.',
                    variant: 'success',
                    delay: 4000,
                  });
                },
                onError: (err: unknown) => {
                  showNotification({
                    title: 'Transfer ownership',
                    message: functionErrorMessage(err),
                    variant: 'danger',
                    delay: 5000,
                  });
                },
              });
            }}
          >
            {handoverTeam.isPending ? 'Transferring…' : 'Transfer'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={deleteOpen} onHide={() => !deleteTeam.isPending && setDeleteOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete team</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            This cancels the team&apos;s subscription immediately (if any) and removes the team for all members. Everyone
            loses access.
          </p>
          <p className="text-danger small mb-0">
            <strong>This cannot be undone.</strong>
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => setDeleteOpen(false)} disabled={deleteTeam.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteTeam.isPending}
            onClick={() => {
              deleteTeam.mutate(undefined, {
                onSuccess: async () => {
                  setDeleteOpen(false);
                  if (ws.activeTeamId === teamId) {
                    try {
                      await setWs.mutateAsync({ activeTeamId: null, skipDashboardRedirect: true });
                    } catch (err: unknown) {
                      showNotification({
                        title: 'Workspace',
                        message: functionErrorMessage(err),
                        variant: 'danger',
                        delay: 4000,
                      });
                    }
                  }
                  navigate(ROUTE_PATHS.TEAMS);
                },
                onError: (err: unknown) => {
                  showNotification({
                    title: 'Delete team',
                    message: functionErrorMessage(err),
                    variant: 'danger',
                    delay: 5000,
                  });
                },
              });
            }}
          >
            {deleteTeam.isPending ? 'Deleting…' : 'Delete team'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
