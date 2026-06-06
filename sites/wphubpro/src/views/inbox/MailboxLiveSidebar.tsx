import { ROUTE_PATHS } from '@/config/routePaths';
import { useAdminPlatformMailbox } from '@/context/AdminPlatformMailboxContext';
import { useMailboxFoldersQuery } from '@/domains/mailbox/useMailboxQueries';
import type { MailboxFolderRow } from '@/domains/mailbox/mailboxApi';
import { useInboxLayout } from '@/views/inbox/inboxLayoutContext';
import clsx from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router';
import { TbChartDonutFilled, TbFolder } from 'react-icons/tb';
import SimpleBar from 'simplebar-react';
import { Form } from 'react-bootstrap';

function folderSortKey(m: MailboxFolderRow): number {
  const s = (m.special || '').toLowerCase();
  const p = m.path.toLowerCase();
  if (s.includes('inbox') || p === 'inbox') return 0;
  if (s.includes('sent')) return 1;
  if (s.includes('trash') || s.includes('deleted')) return 2;
  if (s.includes('draft')) return 3;
  if (s.includes('junk') || s.includes('spam')) return 4;
  return 10;
}

function sortMailboxes(boxes: MailboxFolderRow[]): MailboxFolderRow[] {
  return [...boxes].sort((a, b) => {
    const d = folderSortKey(a) - folderSortKey(b);
    if (d !== 0) return d;
    return a.path.localeCompare(b.path);
  });
}

function folderLabel(m: MailboxFolderRow): string {
  const n = m.name?.trim();
  if (n) return n;
  return m.path;
}

const labelHints = [
  { name: 'Important', variant: 'warning' as const },
  { name: 'Client', variant: 'primary' as const },
  { name: 'Follow up', variant: 'info' as const },
];

export default function MailboxLiveSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { selectedFolder, setSelectedFolder, closeMailSidebar } = useInboxLayout();
  const foldersQ = useMailboxFoldersQuery();
  const mailboxes = sortMailboxes(foldersQ.data?.mailboxes ?? []);
  const adminMb = useAdminPlatformMailbox();

  const onSelectFolder = (path: string) => {
    setSelectedFolder(path);
    nav(ROUTE_PATHS.INBOX);
    closeMailSidebar();
  };

  const listRouteActive = loc.pathname === ROUTE_PATHS.INBOX;

  return (
    <SimpleBar className="card h-100 mb-0 rounded-end-0">
      <div className="card-body">
        {adminMb.adminInboxMode && adminMb.platformMailboxes.length > 0 && (
          <div className="mb-3">
            <Form.Label className="small text-muted mb-1">Admin mailbox</Form.Label>
            <Form.Select
              size="sm"
              value={adminMb.selectedPlatformMailboxId ?? ''}
              onChange={(e) => adminMb.setSelectedPlatformMailboxId(e.target.value.trim() || null)}
              aria-label="Select admin mailbox">
              {adminMb.platformMailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Form.Select>
          </div>
        )}
        <Link to={ROUTE_PATHS.INBOX_COMPOSE} className="btn btn-danger fw-medium w-100">
          Compose
        </Link>
        <div className="list-group list-group-flush list-custom mt-3">
          {mailboxes.map((m) => (
            <button
              key={m.path}
              type="button"
              className={clsx('list-group-item list-group-item-action text-start d-flex', {
                active: listRouteActive && selectedFolder === m.path,
              })}
              onClick={() => onSelectFolder(m.path)}>
              <TbFolder className="me-2 opacity-75 fs-lg align-middle" />
              <span className="align-middle">{folderLabel(m)}</span>
            </button>
          ))}

          <div className="list-group-item mt-2">
            <span className="align-middle">Labels</span>
          </div>
          {labelHints.map(({ name, variant }, idx) => (
            <div
              key={idx}
              className="list-group-item py-2 fs-xs text-muted border-0 d-flex align-items-center"
              title="IMAP keywords: add tags from message detail">
              <TbChartDonutFilled className={clsx('me-2 align-middle fs-sm', `text-${variant}`)} />
              <span className="align-middle">{name}</span>
            </div>
          ))}
        </div>
        {foldersQ.isPending && <p className="text-muted small mb-0 px-1 mt-2">Loading folders…</p>}
        {foldersQ.isError && (
          <p className="text-danger small mb-0 px-1 mt-2">{(foldersQ.error as Error)?.message || 'Could not load folders.'}</p>
        )}
        {!foldersQ.isPending && !foldersQ.isError && mailboxes.length === 0 && (
          <p className="text-muted small mb-0 px-1 mt-2">
            {adminMb.adminInboxMode && adminMb.platformMailboxes.length === 0
              ? 'No platform mailboxes. Add them under Admin → Platform settings → Admin inbox.'
              : 'No folders. Configure IMAP in workspace email settings.'}
          </p>
        )}
      </div>
    </SimpleBar>
  );
}
