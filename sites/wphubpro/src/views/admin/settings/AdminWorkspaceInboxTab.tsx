import { useNotificationContext } from '@/context/useNotificationContext';
import {
  ADMIN_WORKSPACE_INBOX_QUERY_KEY,
  ensureMailboxConnection,
  fetchAdminWorkspaceInboxEditorRows,
  type AdminInboxEditorRow,
} from '@/domains/admin/adminWorkspaceInboxQuery';
import { syncTicketMailboxInbox, type MailboxConnection } from '@/domains/mailbox/mailboxApi';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';

export default function AdminWorkspaceInboxTab() {
  const qc = useQueryClient();
  const { showNotification } = useNotificationContext();

  const q = useQuery({
    queryKey: ADMIN_WORKSPACE_INBOX_QUERY_KEY,
    queryFn: fetchAdminWorkspaceInboxEditorRows,
  });

  const [rows, setRows] = useState<AdminInboxEditorRow[]>([]);

  useEffect(() => {
    if (q.data) setRows(q.data);
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r) => ({
        id: r.id.trim() || undefined,
        label: r.label.trim() || 'Mailbox',
        is_ticket_inbox: r.is_ticket_inbox,
        connection: r.connection,
        imap_password: r.imap_password.trim() ? r.imap_password : undefined,
        smtp_password: r.smtp_password.trim() ? r.smtp_password : undefined,
      }));
      await executeFunction(
        APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
        {
          action: 'save_admin_workspace_inbox',
          mailboxes: payload,
        },
        { omitImpersonationHeaders: true },
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ADMIN_WORKSPACE_INBOX_QUERY_KEY });
      await qc.invalidateQueries({ queryKey: ['mailbox-folders'] });
      await qc.invalidateQueries({ queryKey: ['mailbox-messages'] });
      await qc.invalidateQueries({ queryKey: ['mailbox-message'] });
      await qc.invalidateQueries({ queryKey: ['adminTickets'] });
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      showNotification({ title: 'Saved', message: 'Admin workspace mailboxes updated.', variant: 'success' });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Save failed', message: e?.message || 'Unknown error', variant: 'danger' });
    },
  });

  const updateRow = (idx: number, patch: Partial<AdminInboxEditorRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const updateConn = (idx: number, patch: Partial<MailboxConnection>) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, connection: { ...ensureMailboxConnection(r.connection), ...patch } } : r,
      ),
    );
  };

  const syncM = useMutation({
    mutationFn: async (mailboxId: string) => syncTicketMailboxInbox(mailboxId, 'INBOX'),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['adminTickets'] });
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      const n = res?.imported_count ?? 0;
      const examined = res?.examined ?? 0;
      const base = `Imported ${n} ticket(s). Examined ${examined} unseen message(s).`;
      const detail = res?.success === false && res?.message ? ` ${res.message}` : '';
      showNotification({
        title: 'Ticket import',
        message: `${base}${detail}`,
        variant: n ? 'success' : res?.success === false ? 'warning' : 'secondary',
      });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Import failed', message: e?.message || 'Unknown error', variant: 'danger' });
    },
  });

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: '',
        label: 'New mailbox',
        is_ticket_inbox: false,
        connection: ensureMailboxConnection(undefined),
        imap_password: '',
        smtp_password: '',
        has_imap_password: false,
        has_smtp_password: false,
      },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  if (q.isPending) {
    return (
      <div className="d-flex align-items-center gap-2 text-muted py-4">
        <Spinner animation="border" size="sm" role="status" />
        Loading admin mailboxes…
      </div>
    );
  }

  if (q.isError) {
    return (
      <Alert variant="danger">{(q.error as Error)?.message || 'Could not load admin mailboxes.'}</Alert>
    );
  }

  return (
    <Row>
      <Col lg={11} xl={9}>
        <Card className="border">
          <Card.Body>
            <Card.Title as="h5">Admin workspace · Inbox mailboxes</Card.Title>
            <Card.Text className="text-muted small">
              These accounts are used when an admin opens the <strong>Inbox</strong> in <strong>Admin</strong> mode.
              Passwords are stored encrypted like personal and team mailboxes.
              <br />
              <strong>Ticket inbox:</strong> new mail in INBOX can be imported as support tickets. Known senders are matched
              to existing users; others are stored as guest tickets. Imported messages are marked so they are not imported
              again.
            </Card.Text>

            {rows.length === 0 && <Alert variant="secondary">No mailboxes yet. Add one below.</Alert>}

            {rows.map((row, idx) => (
              <Card key={row.id || `new-${idx}`} className="mb-3 border bg-body-secondary">
                <Card.Body>
                  <div className="d-flex flex-wrap justify-content-between gap-2 mb-2">
                    <h6 className="mb-0 text-muted text-uppercase fs-xs fw-semibold">Mailbox {idx + 1}</h6>
                    <Button type="button" variant="outline-danger" size="sm" onClick={() => removeRow(idx)}>
                      Remove
                    </Button>
                  </div>
                  <Row className="g-2 mb-2">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Label (shown in Inbox)</Form.Label>
                        <Form.Control
                          value={row.label}
                          onChange={(e) => updateRow(idx, { label: e.target.value })}
                          placeholder="e.g. Support"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6} className="d-flex align-items-end pb-2">
                      <Form.Check
                        type="checkbox"
                        id={`ticket-inbox-${row.id || `idx-${idx}`}`}
                        label="Create support tickets from this mailbox"
                        checked={row.is_ticket_inbox}
                        onChange={(e) => updateRow(idx, { is_ticket_inbox: e.target.checked })}
                      />
                      <Form.Text className="d-block text-muted">
                        When enabled, unseen messages in INBOX can be imported as tickets (save mailboxes first, then use
                        Import below).
                      </Form.Text>
                    </Col>
                  </Row>
                  {row.is_ticket_inbox && row.id ? (
                    <div className="mb-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline-primary"
                        disabled={syncM.isPending}
                        onClick={() => syncM.mutate(row.id)}
                      >
                        {syncM.isPending ? 'Importing…' : 'Import unseen from INBOX now'}
                      </Button>
                    </div>
                  ) : null}
                  <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">IMAP</h6>
                  <Row className="g-2 mb-2">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Host</Form.Label>
                        <Form.Control
                          value={row.connection.imap_host}
                          onChange={(e) => updateConn(idx, { imap_host: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Port</Form.Label>
                        <Form.Control
                          type="number"
                          value={row.connection.imap_port}
                          onChange={(e) => updateConn(idx, { imap_port: Number(e.target.value) || 993 })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3} className="d-flex align-items-end pb-2">
                      <Form.Check
                        type="checkbox"
                        label="TLS / SSL"
                        checked={row.connection.imap_tls}
                        onChange={(e) => updateConn(idx, { imap_tls: e.target.checked })}
                      />
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Username</Form.Label>
                        <Form.Control
                          value={row.connection.imap_user}
                          onChange={(e) => updateConn(idx, { imap_user: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>IMAP password {row.has_imap_password ? '(leave blank to keep)' : ''}</Form.Label>
                        <Form.Control
                          type="password"
                          autoComplete="new-password"
                          value={row.imap_password}
                          onChange={(e) => updateRow(idx, { imap_password: e.target.value })}
                          placeholder={row.has_imap_password ? '••••••••' : ''}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">SMTP</h6>
                  <Row className="g-2 mb-2">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Host</Form.Label>
                        <Form.Control
                          value={row.connection.smtp_host}
                          onChange={(e) => updateConn(idx, { smtp_host: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Port</Form.Label>
                        <Form.Control
                          type="number"
                          value={row.connection.smtp_port}
                          onChange={(e) => updateConn(idx, { smtp_port: Number(e.target.value) || 587 })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={3} className="d-flex align-items-end pb-2">
                      <Form.Check
                        type="checkbox"
                        label="TLS"
                        checked={row.connection.smtp_tls}
                        onChange={(e) => updateConn(idx, { smtp_tls: e.target.checked })}
                      />
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>SMTP user (optional)</Form.Label>
                        <Form.Control
                          value={row.connection.smtp_user}
                          onChange={(e) => updateConn(idx, { smtp_user: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>SMTP password {row.has_smtp_password ? '(leave blank to keep)' : ''}</Form.Label>
                        <Form.Control
                          type="password"
                          autoComplete="new-password"
                          value={row.smtp_password}
                          onChange={(e) => updateRow(idx, { smtp_password: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">Identity</h6>
                  <Row className="g-2">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>From email</Form.Label>
                        <Form.Control
                          value={row.connection.from_email}
                          onChange={(e) => updateConn(idx, { from_email: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>From name</Form.Label>
                        <Form.Control
                          value={row.connection.from_name}
                          onChange={(e) => updateConn(idx, { from_name: e.target.value })}
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            ))}

            <div className="d-flex flex-wrap gap-2">
              <Button type="button" variant="outline-primary" onClick={addRow}>
                Add mailbox
              </Button>
              <Button type="button" variant="primary" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
                {saveM.isPending ? 'Saving…' : 'Save mailboxes'}
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
