import ComponentCard from '@/components/cards/ComponentCard';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAdminPlatformMailbox } from '@/context/AdminPlatformMailboxContext';
import { useEmailTemplatesList } from '@/domains/system-email/hooks';
import { DEFAULT_MAIL_PAGE_SIZE, useMailboxMessagesQuery } from '@/domains/mailbox/useMailboxQueries';
import { Button, ListGroup, Spinner } from 'react-bootstrap';
import { Link } from 'react-router';
import { TbMail, TbPencil } from 'react-icons/tb';

function formatMessageDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EmailCard() {
  const templatesQ = useEmailTemplatesList();
  const adminMb = useAdminPlatformMailbox();
  const inboxQ = useMailboxMessagesQuery('INBOX', 1, Math.min(8, DEFAULT_MAIL_PAGE_SIZE));
  const messages = inboxQ.data?.messages ?? [];
  const templateCount = templatesQ.data?.items?.length;

  const inboxReady = adminMb.adminInboxMode && adminMb.adminInboxReady && !adminMb.platformMailboxesLoading;
  const hasMailbox = adminMb.platformMailboxes.length > 0;

  return (
    <ComponentCard
      title="Email"
      className="admin-dashboard-card h-100 w-100"
      fillColumnHeight
      bodyClassName="admin-dashboard-card-body d-flex flex-column min-h-0"
      headerActions={
        <div className="d-flex gap-1">
          <Button as={Link} to={ROUTE_PATHS.INBOX_COMPOSE} variant="primary" size="sm">
            <TbPencil className="me-1" />
            Compose
          </Button>
          <Button as={Link} to={ROUTE_PATHS.INBOX} variant="outline-secondary" size="sm">
            Inbox
          </Button>
        </div>
      }
    >
      <p className="text-muted small mb-2 flex-shrink-0">
        Templates:{' '}
        {templatesQ.isLoading ? (
          <Spinner animation="border" size="sm" className="align-middle" />
        ) : (
          <strong>{templateCount ?? '—'}</strong>
        )}
        {' · '}
        <Link to={ROUTE_PATHS.ADMIN_COMMUNICATION_SYSTEM_EMAILS}>Manage</Link>
      </p>

      <h6 className="text-muted text-uppercase fs-xxs fw-semibold mb-2 flex-shrink-0">Platform inbox</h6>
      <div className="admin-dashboard-scroll flex-grow-1 min-h-0">
        {!inboxReady ? (
          <p className="text-muted small mb-0">Loading platform mailbox…</p>
        ) : !hasMailbox ? (
          <p className="text-muted small mb-0">
            No platform mailbox configured.{' '}
            <Link to={ROUTE_PATHS.ADMIN_SETTINGS}>Add one in Platform settings</Link>.
          </p>
        ) : inboxQ.isLoading ? (
          <div className="d-flex justify-content-center py-3">
            <Spinner animation="border" size="sm" variant="primary" />
          </div>
        ) : inboxQ.isError ? (
          <p className="text-muted small mb-0">Could not load inbox preview. Open the inbox to retry.</p>
        ) : messages.length === 0 ? (
          <p className="text-muted small mb-0">INBOX is empty.</p>
        ) : (
          <ListGroup variant="flush" className="admin-dashboard-email-list">
            {messages.slice(0, 6).map((m) => (
            <ListGroup.Item
              key={m.uid}
              action
              as={Link}
              to={ROUTE_PATHS.inboxMessagePath(String(m.uid))}
              className="px-0 border-0 border-bottom"
            >
              <div className="d-flex gap-2 align-items-start">
                <TbMail className="text-muted flex-shrink-0 mt-1" />
                <div className="min-w-0 flex-grow-1">
                  <div className="d-flex justify-content-between gap-2">
                    <span className="fw-medium text-truncate">{m.subject || '(no subject)'}</span>
                    <span className="text-muted small flex-shrink-0">{formatMessageDate(m.date)}</span>
                  </div>
                  <div className="text-muted small text-truncate">
                    {m.from_name || m.from_address || 'Unknown sender'}
                  </div>
                </div>
              </div>
            </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </div>
    </ComponentCard>
  );
}
