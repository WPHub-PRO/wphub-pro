import { ROUTE_PATHS } from '@/config/routePaths';
import { DEFAULT_MAIL_PAGE_SIZE, useMailboxMessagesQuery, useMailboxWorkspaceParts } from '@/domains/mailbox/useMailboxQueries';
import { useWorkspaceContext } from '@/domains/workspace/useWorkspaceContext';
import { useInboxLayout } from '@/views/inbox/inboxLayoutContext';
import { workspaceInboxListToolbarActions } from '@/views/inbox/ubold-email/workspaceInboxToolbarActions';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, FormControl, OverlayTrigger, Pagination, Tooltip } from 'react-bootstrap';
import { LuSearch } from 'react-icons/lu';
import { TbMenu2, TbPaperclip, TbStar, TbStarFilled } from 'react-icons/tb';
import { Link } from 'react-router';
import SimpleBar from 'simplebar-react';

function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 0) return [];
  if (total <= 9) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1, current - 2, current + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('ellipsis');
    out.push(p);
    prev = p;
  }
  return out;
}

export default function WorkspaceInboxListPane() {
  const { selectedFolder, toggleMailSidebar } = useInboxLayout();
  const { mode, workspaceQueryKey } = useWorkspaceContext();
  const mbParts = useMailboxWorkspaceParts();
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_MAIL_PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [workspaceQueryKey, mbParts.routeKey, selectedFolder]);

  const q = useMailboxMessagesQuery(selectedFolder, page, pageSize);
  const totalPages = Math.max(0, q.data?.total_pages ?? 0);
  const totalMessages = q.data?.total_messages ?? 0;

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const [search, setSearch] = useState('');
  const rows = useMemo(
    () =>
      (q.data?.messages || []).filter(
        (m) =>
          !search.trim() ||
          m.subject.toLowerCase().includes(search.toLowerCase()) ||
          m.from_address.toLowerCase().includes(search.toLowerCase()) ||
          m.from_name.toLowerCase().includes(search.toLowerCase()) ||
          (m.snippet && m.snippet.toLowerCase().includes(search.toLowerCase())),
      ),
    [q.data?.messages, search],
  );

  const [selected, setSelected] = useState<string[]>([]);
  const isAllSelected = rows.length > 0 && selected.length === rows.length;

  useEffect(() => {
    setSelected([]);
  }, [selectedFolder, page, workspaceQueryKey, mbParts.routeKey, q.data?.messages]);

  const handleSelectAll = () => {
    setSelected(isAllSelected ? [] : rows.map((e) => e.uid));
  };

  const handleSelect = (uid: string) => {
    setSelected((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const pageItems = useMemo(() => buildPageList(page, totalPages), [page, totalPages]);

  return (
    <Card className="h-100 mb-0 rounded-start-0 flex-grow-1 border-start-0">
      <CardHeader className="d-lg-none d-flex gap-2">
        <button
          className="btn btn-default btn-icon"
          type="button"
          onClick={() => toggleMailSidebar()}
          aria-controls="emailSidebaroffcanvas"
          aria-label="Menu">
          <TbMenu2 className="fs-lg" />
        </button>
        <div className="app-search flex-grow-1">
          <FormControl value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mails..." aria-label="Search mail" />
          <LuSearch className="app-search-icon text-muted" />
        </div>
      </CardHeader>
      <CardHeader className="card-header card-bg justify-content-between">
        <div className="d-flex flex-wrap align-items-center gap-1">
          <input
            checked={isAllSelected}
            onChange={handleSelectAll}
            className="form-check-input form-check-input-light fs-14 mt-0 me-3"
            type="checkbox"
            id="select-all-email"
            disabled={rows.length === 0}
            aria-label="Select all on this page"
          />
          {workspaceInboxListToolbarActions.map(({ label, icon: Icon }, idx) => (
            <OverlayTrigger overlay={<Tooltip>{label}</Tooltip>} placement="top" key={idx}>
              <button type="button" className="btn btn-default btn-icon btn-sm" aria-label={label}>
                <Icon className="fs-lg" />
              </button>
            </OverlayTrigger>
          ))}
        </div>
        <div className="app-search d-none d-lg-inline-flex">
          <FormControl
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="text"
            placeholder="Search mails..."
            aria-label="Search mail"
          />
          <LuSearch className="app-search-icon text-muted" />
        </div>
      </CardHeader>
      <SimpleBar className="card-body px-3 py-0" style={{ height: 'calc(100% - 100px)', minHeight: 240 }} data-simplebar data-simplebar-md>
        {q.isPending && (
          <div className="d-flex align-items-center justify-content-center gap-2 p-3">
            <strong>Loading…</strong>
            <div className="spinner-border spinner-border-sm text-danger" role="status" aria-hidden="true" />
          </div>
        )}
        {q.isError && (
          <p className="text-danger p-3 mb-0 small">{(q.error as Error)?.message || 'Could not load messages.'}</p>
        )}
        {!q.isPending && !q.isError && totalMessages === 0 && (
          <p className="text-muted p-3 mb-0">
            No messages in this folder. Active workspace is <strong>{mode}</strong> — IMAP settings apply to personal vs team
            separately (Profile → Workspace email, or Team settings).
          </p>
        )}
        {!q.isPending && !q.isError && totalMessages > 0 && rows.length === 0 && search.trim() && (
          <div className="table-responsive">
            <table className="table table-hover table-select mb-0">
              <tbody>
                <tr className="no-results">
                  <td colSpan={5} className="text-center text-muted py-3">
                    Nothing found.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {!q.isPending && !q.isError && rows.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover table-select mb-0">
              <tbody>
                {rows.map((email) => {
                  const flagged = Boolean(email.flagged);
                  const snippet = email.snippet?.trim() || '';
                  return (
                    <tr className={clsx('position-relative', email.seen ? 'mark-as-read' : '')} key={email.uid}>
                      <td className="ps-3" style={{ width: '1%' }}>
                        <div className="d-flex gap-3">
                          <input
                            className="form-check-input form-check-input-light fs-14 position-relative z-2 mt-0 email-item-check"
                            type="checkbox"
                            checked={selected.includes(email.uid)}
                            onChange={() => handleSelect(email.uid)}
                            aria-label="Select message"
                          />
                          <span className="btn p-0 fs-xl border-0 bg-transparent" role="presentation" aria-hidden>
                            {flagged ? <TbStarFilled className="text-warning" /> : <TbStar className="text-muted" />}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <div className="avatar-xs">
                            <span className="avatar-title rounded-circle bg-primary-subtle text-primary">
                              {(email.from_name || email.from_address || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <h5 className="fs-base mb-0 fw-medium">{email.from_name || email.from_address || 'Unknown'}</h5>
                        </div>
                      </td>
                      <td>
                        <Link to={ROUTE_PATHS.inboxMessagePath(email.uid)} className="link-reset fs-base fw-medium stretched-link">
                          {email.subject || '(no subject)'}
                        </Link>
                        &nbsp;<span className="d-xl-inline-block d-none">—</span>&nbsp;
                        <span className="fs-base text-muted d-xl-inline-block d-none mb-0">{snippet || ' '}</span>
                      </td>
                      <td style={{ width: '1%' }}>
                        <div className="d-flex align-items-center gap-1 opacity-25">
                          <TbPaperclip />
                          <span className="fw-semibold">0</span>
                        </div>
                      </td>
                      <td>
                        <p className="fs-xs text-muted mb-0 text-end pe-2">{email.date ? new Date(email.date).toLocaleString() : ''}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!q.isPending && !q.isError && totalPages > 1 && (
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-md-between gap-2 px-3 py-2 border-top">
            <small className="text-muted mb-0">
              {totalMessages} message{totalMessages === 1 ? '' : 's'} — page {page} of {totalPages} ({pageSize} per page)
            </small>
            <Pagination className="mb-0 flex-wrap justify-content-md-end">
              <Pagination.Prev disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
              {pageItems.map((item, idx) =>
                item === 'ellipsis' ? (
                  <Pagination.Ellipsis key={`e-${idx}`} disabled />
                ) : (
                  <Pagination.Item key={item} active={item === page} onClick={() => setPage(item)}>
                    {item}
                  </Pagination.Item>
                ),
              )}
              <Pagination.Next disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} />
            </Pagination>
          </div>
        )}
        {!q.isPending && !q.isError && totalMessages > 0 && totalPages <= 1 && (
          <div className="px-3 py-2 border-top">
            <small className="text-muted">{totalMessages} message{totalMessages === 1 ? '' : 's'}</small>
          </div>
        )}
      </SimpleBar>
    </Card>
  );
}
