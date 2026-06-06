import {
  TABLE_ACTION_GROUP_CLASS,
  TABLE_ACTION_ICON_DANGER_CLASS,
  TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS,
} from '@/components/table/tableActionClasses';
import {
  useTeamInviteResendMutation,
  useTeamInviteRevokeMutation,
  useTeamPendingInvites,
  type TeamPendingInviteRow,
} from '@/domains/teams';
import { useNotificationContext } from '@/context/useNotificationContext';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import { useState } from 'react';
import { Alert, Button, Modal, Spinner, Table } from 'react-bootstrap';
import { TbBan, TbMailForward } from 'react-icons/tb';

function formatInviteInstant(iso: string): string {
  const s = iso.trim();
  if (!s) return '—';
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : s;
}

function inviteErrorMessage(err: unknown): string {
  if (err instanceof AppwriteFunctionError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

type TeamPendingInvitesSectionProps = {
  teamId: string;
  enabled: boolean;
};

export function TeamPendingInvitesSection({ teamId, enabled }: TeamPendingInvitesSectionProps) {
  const { showNotification } = useNotificationContext();
  const invitesQ = useTeamPendingInvites(enabled, teamId);
  const resend = useTeamInviteResendMutation(teamId);
  const revoke = useTeamInviteRevokeMutation(teamId);
  const [revokeRow, setRevokeRow] = useState<TeamPendingInviteRow | null>(null);

  if (!enabled) return null;

  return (
    <>
      <div className="mb-4">
        <h6 className="mb-2 text-muted text-uppercase fs-xs fw-semibold">Pending invitations</h6>
        {invitesQ.isLoading ? (
          <div className="d-flex align-items-center gap-2 text-muted small py-2">
            <Spinner animation="border" size="sm" role="status" />
            Loading invites…
          </div>
        ) : invitesQ.error ? (
          <Alert variant="warning" className="py-2 small mb-0">
            {inviteErrorMessage(invitesQ.error)}
          </Alert>
        ) : (invitesQ.data?.length ?? 0) === 0 ? (
          <p className="text-muted small mb-0">No pending invitations.</p>
        ) : (
          <div className="table-responsive border rounded">
            <Table hover className="table table-custom table-centered table-nowrap mb-0 align-middle" size="sm">
              <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                <tr className="text-uppercase fs-xxs">
                  <th>Email</th>
                  <th>Invited</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(invitesQ.data ?? []).map((row) => (
                  <tr key={row.inviteId}>
                    <td>{row.email}</td>
                    <td className="text-muted small">{formatInviteInstant(row.invitedAt)}</td>
                    <td className="small">Member</td>
                    <td className="text-capitalize small">{row.status || 'pending'}</td>
                    <td className="text-end text-nowrap">
                      <div className={TABLE_ACTION_GROUP_CLASS}>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          className={TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS}
                          disabled={resend.isPending || revoke.isPending}
                        aria-label={`Resend invitation to ${row.email}`}
                        title="Resend invitation email"
                        onClick={() => {
                          resend.mutate(row.inviteId, {
                            onSuccess: (payload) => {
                              const ok = payload?.emailDispatched !== false;
                              showNotification({
                                title: 'Invitation',
                                message:
                                  typeof payload?.message === 'string' && payload.message.trim()
                                    ? payload.message.trim()
                                    : ok
                                      ? 'Invitation email sent.'
                                      : 'Invite updated.',
                                variant: ok ? 'success' : 'warning',
                                delay: 4500,
                              });
                            },
                          });
                        }}
                      >
                        {resend.isPending ? (
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
                        ) : (
                          <TbMailForward className="fs-lg" aria-hidden />
                        )}
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          className={TABLE_ACTION_ICON_DANGER_CLASS}
                          disabled={resend.isPending || revoke.isPending}
                          aria-label={`Revoke invitation for ${row.email}`}
                          title="Revoke invitation"
                          onClick={() => setRevokeRow(row)}
                        >
                          <TbBan className="fs-lg" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {resend.error ? (
          <p className="text-danger small mt-2 mb-0">{inviteErrorMessage(resend.error)}</p>
        ) : null}
      </div>

      <Modal
        show={revokeRow != null}
        onHide={() => {
          if (!revoke.isPending) {
            revoke.reset();
            setRevokeRow(null);
          }
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Revoke invitation</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {revokeRow ? (
            <>
              Remove the pending invite for <strong>{revokeRow.email}</strong>? They will not be able to accept this
              invitation anymore.
            </>
          ) : null}
          {revoke.error ? (
            <Alert variant="danger" className="mt-3 mb-0 small">
              {inviteErrorMessage(revoke.error)}
            </Alert>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="light"
            onClick={() => {
              revoke.reset();
              setRevokeRow(null);
            }}
            disabled={revoke.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={revoke.isPending || !revokeRow}
            onClick={() => {
              if (!revokeRow) return;
              revoke.mutate(revokeRow.inviteId, {
                onSuccess: () => {
                  setRevokeRow(null);
                  showNotification({
                    title: 'Invitation',
                    message: 'Invite revoked.',
                    variant: 'success',
                    delay: 3500,
                  });
                },
              });
            }}
          >
            {revoke.isPending ? 'Revoking…' : 'Revoke invite'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
