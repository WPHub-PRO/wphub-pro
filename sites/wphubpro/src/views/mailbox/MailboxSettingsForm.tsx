import type { MailboxConnection } from '@/domains/mailbox/mailboxApi';
import {
  usePersonalMailboxSaveMutation,
  usePersonalMailboxSettingsQuery,
  usePersonalMailboxTestImapMutation,
  usePersonalMailboxTestSmtpMutation,
  useTeamMailboxSaveMutation,
  useTeamMailboxSettingsQuery,
  useTeamMailboxTestImapMutation,
  useTeamMailboxTestSmtpMutation,
} from '@/domains/mailbox/useMailboxQueries';
import { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';

type Props = {
  variant: 'personal' | 'team';
  teamId?: string;
  canEdit: boolean;
};

function emptyConnection(): MailboxConnection {
  return {
    imap_host: '',
    imap_port: 993,
    imap_tls: true,
    imap_user: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_tls: true,
    smtp_user: '',
    from_email: '',
    from_name: '',
  };
}

function MailboxSettingsFields({
  q,
  saveM,
  testImap,
  testSmtp,
  canEdit,
}: {
  q: ReturnType<typeof usePersonalMailboxSettingsQuery>;
  saveM: ReturnType<typeof usePersonalMailboxSaveMutation>;
  testImap: ReturnType<typeof usePersonalMailboxTestImapMutation>;
  testSmtp: ReturnType<typeof usePersonalMailboxTestSmtpMutation>;
  canEdit: boolean;
}) {
  const [conn, setConn] = useState<MailboxConnection>(emptyConnection());
  const [imapPassword, setImapPassword] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');

  useEffect(() => {
    const c = q.data?.connection;
    if (c && typeof c === 'object') {
      setConn({ ...emptyConnection(), ...c });
    }
  }, [q.data?.connection]);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const body: Record<string, unknown> = { connection: conn };
    if (imapPassword.trim()) body.imap_password = imapPassword;
    if (smtpPassword.trim()) body.smtp_password = smtpPassword;
    saveM.mutate(body, {
      onSuccess: () => {
        setImapPassword('');
        setSmtpPassword('');
      },
    });
  };

  if (q.isPending) {
    return (
      <div className="d-flex justify-content-center py-4">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (q.isError) {
    return <Alert variant="danger">{(q.error as Error)?.message || 'Could not load settings.'}</Alert>;
  }

  return (
    <Form onSubmit={onSave}>
      {saveM.isSuccess && saveM.data?.success && <Alert variant="success">Saved.</Alert>}
      {saveM.isError && <Alert variant="danger">{(saveM.error as Error)?.message}</Alert>}
      {!canEdit && <Alert variant="secondary">Only team owners can edit this mailbox.</Alert>}

      <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">IMAP (receive)</h6>
      <Row className="g-2 mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Host</Form.Label>
            <Form.Control
              value={conn.imap_host}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, imap_host: e.target.value }))}
            />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group>
            <Form.Label>Port</Form.Label>
            <Form.Control
              type="number"
              value={conn.imap_port}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, imap_port: Number(e.target.value) || 993 }))}
            />
          </Form.Group>
        </Col>
        <Col md={3} className="d-flex align-items-end pb-2">
          <Form.Check
            type="checkbox"
            id="imap-tls"
            label="TLS / SSL"
            checked={conn.imap_tls}
            disabled={!canEdit}
            onChange={(e) => setConn((c) => ({ ...c, imap_tls: e.target.checked }))}
          />
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Username</Form.Label>
            <Form.Control
              value={conn.imap_user}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, imap_user: e.target.value }))}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Password {q.data?.has_imap_password ? '(leave blank to keep)' : ''}</Form.Label>
            <Form.Control
              type="password"
              autoComplete="new-password"
              value={imapPassword}
              disabled={!canEdit}
              onChange={(e) => setImapPassword(e.target.value)}
              placeholder={q.data?.has_imap_password ? '••••••••' : ''}
            />
          </Form.Group>
        </Col>
      </Row>

      <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">SMTP (send)</h6>
      <Row className="g-2 mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Host</Form.Label>
            <Form.Control
              value={conn.smtp_host}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, smtp_host: e.target.value }))}
            />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group>
            <Form.Label>Port</Form.Label>
            <Form.Control
              type="number"
              value={conn.smtp_port}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, smtp_port: Number(e.target.value) || 587 }))}
            />
          </Form.Group>
        </Col>
        <Col md={3} className="d-flex align-items-end pb-2">
          <Form.Check
            type="checkbox"
            id="smtp-tls"
            label="TLS"
            checked={conn.smtp_tls}
            disabled={!canEdit}
            onChange={(e) => setConn((c) => ({ ...c, smtp_tls: e.target.checked }))}
          />
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Username (optional)</Form.Label>
            <Form.Control
              value={conn.smtp_user}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, smtp_user: e.target.value }))}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>SMTP password {q.data?.has_smtp_password ? '(leave blank to keep)' : ''}</Form.Label>
            <Form.Control
              type="password"
              autoComplete="new-password"
              value={smtpPassword}
              disabled={!canEdit}
              onChange={(e) => setSmtpPassword(e.target.value)}
            />
          </Form.Group>
        </Col>
      </Row>

      <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">Identity</h6>
      <Row className="g-2 mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>From email</Form.Label>
            <Form.Control
              value={conn.from_email}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, from_email: e.target.value }))}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>From name</Form.Label>
            <Form.Control
              value={conn.from_name}
              disabled={!canEdit}
              onChange={(e) => setConn((c) => ({ ...c, from_name: e.target.value }))}
            />
          </Form.Group>
        </Col>
      </Row>

      <div className="d-flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!canEdit || saveM.isPending}>
          {saveM.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline-secondary" disabled={!canEdit || testImap.isPending} onClick={() => testImap.mutate()}>
          {testImap.isPending ? 'Testing…' : 'Test IMAP'}
        </Button>
        <Button type="button" variant="outline-secondary" disabled={!canEdit || testSmtp.isPending} onClick={() => testSmtp.mutate()}>
          {testSmtp.isPending ? 'Testing…' : 'Test SMTP'}
        </Button>
      </div>
      {testImap.isSuccess && testImap.data?.success && (
        <Alert variant="info" className="mt-2 mb-0 py-2 small">
          {testImap.data.message}
        </Alert>
      )}
      {testImap.isError && <Alert variant="warning" className="mt-2 mb-0 py-2 small">{(testImap.error as Error)?.message}</Alert>}
      {testSmtp.isSuccess && testSmtp.data?.success && (
        <Alert variant="info" className="mt-2 mb-0 py-2 small">
          {testSmtp.data.message}
        </Alert>
      )}
      {testSmtp.isError && <Alert variant="warning" className="mt-2 mb-0 py-2 small">{(testSmtp.error as Error)?.message}</Alert>}
    </Form>
  );
}

function PersonalMailbox({ canEdit }: { canEdit: boolean }) {
  const q = usePersonalMailboxSettingsQuery();
  const saveM = usePersonalMailboxSaveMutation();
  const testImap = usePersonalMailboxTestImapMutation();
  const testSmtp = usePersonalMailboxTestSmtpMutation();
  return <MailboxSettingsFields q={q} saveM={saveM} testImap={testImap} testSmtp={testSmtp} canEdit={canEdit} />;
}

function TeamMailbox({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const q = useTeamMailboxSettingsQuery(teamId);
  const saveM = useTeamMailboxSaveMutation(teamId);
  const testImap = useTeamMailboxTestImapMutation(teamId);
  const testSmtp = useTeamMailboxTestSmtpMutation(teamId);
  return <MailboxSettingsFields q={q} saveM={saveM} testImap={testImap} testSmtp={testSmtp} canEdit={canEdit} />;
}

export default function MailboxSettingsForm({ variant, teamId, canEdit }: Props) {
  if (variant === 'team') {
    const tid = teamId?.trim() ?? '';
    if (!tid) return <Alert variant="warning">Missing team id.</Alert>;
    return <TeamMailbox teamId={tid} canEdit={canEdit} />;
  }
  return <PersonalMailbox canEdit={canEdit} />;
}
