import { useAdminPlatformMailbox } from '@/context/AdminPlatformMailboxContext';
import { useNotificationContext } from '@/context/useNotificationContext';
import { ROUTE_PATHS } from '@/config/routePaths';
import type { MessageActionOp } from '@/domains/mailbox/mailboxApi';
import {
  useMailboxCreateTicketFromMessageMutation,
  useMailboxFoldersQuery,
  useMailboxMessageActionMutation,
  useMailboxMessageQuery,
  useMailboxWorkspaceParts,
} from '@/domains/mailbox/useMailboxQueries';
import MailHtmlFrame from '@/views/inbox/MailHtmlFrame';
import { useInboxLayout } from '@/views/inbox/inboxLayoutContext';
import {
  extractEmailFromFromHeader,
  sanitizeEmailQuoteHtml,
  stripHtmlToText,
  type MailComposeLocationState,
} from '@/views/inbox/mailComposeUtils';
import { Button, Card, CardHeader, Dropdown, Form, OverlayTrigger, Spinner, Tooltip } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LuSearch } from 'react-icons/lu';
import {
  TbAlertCircle,
  TbArchive,
  TbArrowForwardUp,
  TbArrowLeftDashed,
  TbClockPause,
  TbCornerUpLeft,
  TbDotsVertical,
  TbFolder,
  TbMail,
  TbMailForward,
  TbMailOpened,
  TbMenu2,
  TbPrinter,
  TbShare3,
  TbStar,
  TbStarFilled,
  TbTag,
  TbTicket,
  TbTrash,
} from 'react-icons/tb';
import SimpleBar from 'simplebar-react';

function buildQuotedBody(msg: { textPlain?: string; textHtml?: string }): string {
  const plain = msg.textPlain?.trim();
  if (plain) return plain;
  return stripHtmlToText(msg.textHtml || '');
}

function parseFromDisplay(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)\s*<([^>]+)>$/s);
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, '').trim();
    return { name: name || m[2].trim(), email: m[2].trim() };
  }
  const email = extractEmailFromFromHeader(from);
  return { name: email || from.trim() || 'Unknown', email: email || '' };
}

export default function WorkspaceInboxDetailPane() {
  const { messageUid } = useParams<{ messageUid: string }>();
  const navigate = useNavigate();
  const { selectedFolder, toggleMailSidebar } = useInboxLayout();
  const q = useMailboxMessageQuery(selectedFolder, messageUid);
  const msg = q.data?.success ? q.data : null;
  const subject = msg?.subject?.trim() || '(no subject)';
  const uidNum = Number(messageUid);
  const uidOk = Number.isFinite(uidNum) && uidNum > 0;

  const foldersQ = useMailboxFoldersQuery();
  const actionM = useMailboxMessageActionMutation();
  const parts = useMailboxWorkspaceParts();
  const adminMb = useAdminPlatformMailbox();
  const { showNotification } = useNotificationContext();
  const createTicketFromMsg = useMailboxCreateTicketFromMessageMutation();

  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const folderRows = useMemo(() => foldersQ.data?.mailboxes ?? [], [foldersQ.data?.mailboxes]);
  const moveTargets = useMemo(
    () => folderRows.filter((r) => r.path !== selectedFolder).sort((a, b) => a.path.localeCompare(b.path)),
    [folderRows, selectedFolder],
  );

  const fromParts = msg?.from ? parseFromDisplay(msg.from) : { name: '', email: '' };

  const selectedPlatformMb = adminMb.platformMailboxes.find((m) => m.id === adminMb.selectedPlatformMailboxId);
  const showPlatformTicketButton = parts.workspace === 'platform_admin' && parts.mailboxQueriesEnabled;
  const ticketInboxEnabled = Boolean(selectedPlatformMb?.is_ticket_inbox);

  const runAction = async (op: MessageActionOp, extra?: { target_folder?: string; tag?: string }) => {
    setErr(null);
    setNotice(null);
    if (!uidOk) {
      setErr('Invalid message.');
      return;
    }
    try {
      await actionM.mutateAsync({
        op,
        folder: selectedFolder,
        uid: uidNum,
        ...extra,
      });
      if (op === 'delete' || op === 'archive' || op === 'snooze' || op === 'move') {
        navigate(ROUTE_PATHS.INBOX);
      } else {
        setNotice('Updated.');
        await q.refetch();
      }
    } catch (e) {
      setErr((e as Error)?.message || 'Action failed.');
    }
  };

  const onDelete = () => {
    if (!window.confirm('Move this message to Trash?')) return;
    void runAction('delete');
  };

  const onShare = async () => {
    const url = window.location.href;
    setErr(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: subject, url });
        setNotice('Shared.');
      } else {
        await navigator.clipboard.writeText(url);
        setNotice('Link copied to clipboard.');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setNotice('Link copied to clipboard.');
      } catch {
        setErr('Could not copy link.');
      }
    }
  };

  const openCompose = (mode: 'reply' | 'forward') => {
    if (!msg) return;
    const body = buildQuotedBody(msg);
    const bodyHtml = sanitizeEmailQuoteHtml(msg.textHtml || '') || undefined;
    const state: MailComposeLocationState = {
      mailCompose: {
        mode,
        messageKey: `${selectedFolder}:${messageUid}`,
        to: mode === 'reply' ? extractEmailFromFromHeader(msg.from || '') : '',
        subject: msg.subject || '',
        body,
        bodyHtml,
        messageId: msg.message_id,
        references: msg.references,
      },
    };
    navigate(ROUTE_PATHS.INBOX_COMPOSE, { state });
  };

  const onCreateTicketFromMail = () => {
    if (!uidOk || !msg) return;
    createTicketFromMsg.mutate(
      { folder: selectedFolder, uid: uidNum },
      {
        onSuccess: (data) => {
          const tid = data.ticket_id?.trim();
          showNotification({
            title: 'Ticket created',
            message: tid
              ? `Support ticket ${tid.slice(0, 8)}… created from this message.`
              : 'Support ticket created from this message.',
            variant: 'success',
            delay: 4500,
          });
          void q.refetch();
        },
        onError: (e) => {
          showNotification({
            title: 'Could not create ticket',
            message: e instanceof Error ? e.message : 'Try again.',
            variant: 'danger',
            delay: 6000,
          });
        },
      },
    );
  };

  const applyTag = async () => {
    const t = tagInput.trim();
    if (!t) {
      setErr('Enter a tag name.');
      return;
    }
    await runAction('tag_add', { tag: t });
    setTagOpen(false);
    setTagInput('');
  };

  const removeTag = async () => {
    const t = tagInput.trim();
    if (!t) {
      setErr('Enter the tag name to remove.');
      return;
    }
    await runAction('tag_remove', { tag: t });
    setTagOpen(false);
    setTagInput('');
  };

  const toolbarBusy = actionM.isPending || createTicketFromMsg.isPending;

  return (
    <Card className="h-100 mb-0 rounded-start-0 flex-grow-1 border-start-0 position-relative">
      <CardHeader className="d-lg-none d-flex gap-2">
        <button className="btn btn-default btn-icon" type="button" onClick={() => toggleMailSidebar()} aria-label="Menu">
          <TbMenu2 className="fs-lg" />
        </button>
        <div className="app-search flex-grow-1">
          <input type="text" className="form-control" placeholder="Search mails..." readOnly tabIndex={-1} />
          <LuSearch className="app-search-icon text-muted" />
        </div>
      </CardHeader>
      <CardHeader className="card-bg justify-content-between flex-wrap gap-1">
        <div className="d-flex flex-wrap align-items-center gap-1">
          <OverlayTrigger overlay={<Tooltip>Back to Inbox</Tooltip>} placement="top">
            <Link to={ROUTE_PATHS.INBOX} className="btn btn-default btn-icon btn-sm">
              <TbArrowLeftDashed className="fs-lg" />
            </Link>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Delete (move to Trash)</Tooltip>} placement="top">
            <span className="d-inline-block">
              <button
                type="button"
                className="btn btn-default btn-icon btn-sm"
                disabled={toolbarBusy || !msg}
                onClick={() => void onDelete()}>
                <TbTrash className="fs-lg" />
              </button>
            </span>
          </OverlayTrigger>
          <OverlayTrigger
            overlay={<Tooltip>{msg?.seen ? 'Mark as unread' : 'Mark as read'}</Tooltip>}
            placement="top">
            <span className="d-inline-block">
              <button
                type="button"
                className="btn btn-default btn-icon btn-sm"
                disabled={toolbarBusy || !msg}
                onClick={() => void runAction(msg?.seen ? 'mark_unread' : 'mark_read')}>
                {msg?.seen ? <TbMail className="fs-lg" /> : <TbMailOpened className="fs-lg" />}
              </button>
            </span>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Tag (custom IMAP flag)</Tooltip>} placement="top">
            <span className="d-inline-block">
              <button
                type="button"
                className="btn btn-default btn-icon btn-sm"
                disabled={toolbarBusy || !msg}
                onClick={() => {
                  setErr(null);
                  setTagOpen(true);
                }}>
                <TbTag className="fs-lg" />
              </button>
            </span>
          </OverlayTrigger>
          <OverlayTrigger overlay={<Tooltip>Archive</Tooltip>} placement="top">
            <span className="d-inline-block">
              <button
                type="button"
                className="btn btn-default btn-icon btn-sm"
                disabled={toolbarBusy || !msg}
                onClick={() => void runAction('archive')}>
                <TbArchive className="fs-lg" />
              </button>
            </span>
          </OverlayTrigger>
        </div>
        <div className="d-flex align-items-center gap-1">
          <OverlayTrigger overlay={<Tooltip>Share or copy link</Tooltip>} placement="top">
            <span className="d-inline-block">
              <button type="button" className="btn btn-icon btn-sm btn-ghost-secondary rounded-circle" onClick={() => void onShare()}>
                <TbShare3 className="fs-xl" />
              </button>
            </span>
          </OverlayTrigger>
          <Dropdown align="end">
            <Dropdown.Toggle variant="light" className="btn btn-icon btn-sm btn-ghost-dark rounded-circle border-0" id="inbox-detail-more">
              <TbDotsVertical className="fs-xl" />
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item
                disabled={toolbarBusy || !msg}
                onClick={() => {
                  setMoveOpen(true);
                }}>
                <TbFolder className="me-2 opacity-75" />
                Move to folder…
              </Dropdown.Item>
              <Dropdown.Item disabled={!msg} onClick={() => openCompose('forward')}>
                <TbArrowForwardUp className="me-2 opacity-75" />
                Forward
              </Dropdown.Item>
              <Dropdown.Item disabled={toolbarBusy || !msg} onClick={() => void runAction('snooze')}>
                <TbClockPause className="me-2 opacity-75" />
                Snooze
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item
                disabled={toolbarBusy || !msg}
                onClick={() => void runAction(msg?.flagged ? 'unflag' : 'flag')}>
                <TbAlertCircle className="me-2 opacity-75" />
                {msg?.flagged ? 'Remove important' : 'Mark as important'}
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </CardHeader>
      {(notice || err) && (
        <div className="px-3 pt-2">
          {notice ? <p className="text-success small mb-1">{notice}</p> : null}
          {err ? <p className="text-danger small mb-0">{err}</p> : null}
        </div>
      )}
      <SimpleBar className="card-body pt-0 pb-5" style={{ height: 'calc(100% - 100px)', minHeight: 240 }} data-simplebar data-simplebar-md>
        {q.isPending && <p className="text-muted mb-0 py-3">Loading…</p>}
        {q.isError && <p className="text-danger mb-0 small py-3">{(q.error as Error)?.message}</p>}
        {msg && (
          <>
            <h4 className="py-3 mb-0 sticky-top bg-body-secondary">{msg.subject || '(no subject)'}</h4>
            <div className="pb-3">
              <div className="d-flex align-items-center">
                <div className="d-flex align-items-center flex-grow-1 text-reset">
                  <div className="avatar-md rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center fw-semibold">
                    {(fromParts.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="ms-2 overflow-hidden">
                    <h5 className="fs-sm mb-0 text-truncate">{fromParts.name}</h5>
                    <p className="text-muted mb-0 text-truncate">{fromParts.email || msg.from}</p>
                  </div>
                </div>
                <div className="ms-auto d-flex align-items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="btn btn-icon btn-sm btn-ghost-light rounded-circle"
                    disabled={toolbarBusy || !msg}
                    onClick={() => void runAction(msg.flagged ? 'unflag' : 'flag')}
                    aria-label={msg.flagged ? 'Remove star' : 'Star'}>
                    {msg.flagged ? <TbStarFilled className="text-warning fs-lg" /> : <TbStar className="text-muted fs-lg" />}
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-sm btn-ghost-light text-dark rounded-circle"
                    disabled={!msg}
                    onClick={() => openCompose('forward')}
                    aria-label="Forward">
                    <TbMailForward className="fs-lg" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-sm btn-ghost-light text-dark rounded-circle"
                    disabled={toolbarBusy || !msg}
                    onClick={() => void runAction(msg.seen ? 'mark_unread' : 'mark_read')}
                    aria-label={msg.seen ? 'Mark unread' : 'Mark read'}>
                    <TbMailOpened className="fs-lg" />
                  </button>
                  <span className="text-muted fs-xs mb-0 ms-2 text-nowrap">
                    {msg.date ? new Date(msg.date).toLocaleString() : ''}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <MailHtmlFrame html={msg.textHtml} plain={msg.textPlain} title={msg.subject || 'Email message'} />
              </div>
            </div>
          </>
        )}
      </SimpleBar>
      <CardHeader className="bg-body-secondary border-top border-dashed border-bottom-0 position-absolute bottom-0 w-100">
        <div className="d-flex flex-wrap align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-sm btn-default" type="button" disabled={!msg} onClick={() => openCompose('reply')}>
              <TbCornerUpLeft className="fs-lg" />
              <span className="fw-medium ms-1">Reply</span>
            </button>
            <button className="btn btn-sm btn-default" type="button" disabled={!msg} onClick={() => openCompose('forward')}>
              <TbMailForward className="fs-lg" />
              <span className="fw-medium ms-1">Forward</span>
            </button>
            {showPlatformTicketButton ? (
              <OverlayTrigger
                overlay={
                  <Tooltip id="inbox-create-ticket-tip">
                    {ticketInboxEnabled
                      ? 'Create a support ticket from this email (same mapping as IMAP ticket inbox import).'
                      : 'Turn on “Ticket inbox” for this mailbox under Admin → Platform settings → Admin inbox.'}
                  </Tooltip>
                }
                placement="top">
                <span className="d-inline-block">
                  <button
                    className="btn btn-sm btn-default"
                    type="button"
                    disabled={!msg || !ticketInboxEnabled || toolbarBusy}
                    onClick={() => void onCreateTicketFromMail()}>
                    {createTicketFromMsg.isPending ? (
                      <Spinner animation="border" size="sm" className="me-1" role="status" />
                    ) : (
                      <TbTicket className="fs-lg" />
                    )}
                    <span className="fw-medium ms-1">Create ticket</span>
                  </button>
                </span>
              </OverlayTrigger>
            ) : null}
            <button className="btn btn-sm btn-default" type="button" onClick={() => window.print()}>
              <TbPrinter className="fs-lg" />
              <span className="fw-medium ms-1">Print</span>
            </button>
          </div>
        </div>
      </CardHeader>

      <Modal show={moveOpen} onHide={() => setMoveOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Move to folder</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0" style={{ maxHeight: 360, overflow: 'auto' }}>
          {foldersQ.isPending && (
            <div className="p-3 text-muted">
              <Spinner size="sm" className="me-2" animation="border" />
              Loading folders…
            </div>
          )}
          {foldersQ.isError && <p className="text-danger small p-3 mb-0">{(foldersQ.error as Error)?.message}</p>}
          <div className="list-group list-group-flush">
            {moveTargets.map((row) => (
              <button
                key={row.path}
                type="button"
                className="list-group-item list-group-item-action text-start"
                disabled={toolbarBusy}
                onClick={() => {
                  void (async () => {
                    await runAction('move', { target_folder: row.path });
                    setMoveOpen(false);
                  })();
                }}>
                {row.name?.trim() || row.path}
              </button>
            ))}
          </div>
          {!foldersQ.isPending && moveTargets.length === 0 && (
            <p className="text-muted small p-3 mb-0">No other folders to move to.</p>
          )}
        </Modal.Body>
      </Modal>

      <Modal show={tagOpen} onHide={() => setTagOpen(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Tag</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted small">
            Adds a private IMAP keyword on the server (letters, numbers, dash, underscore). Same name is used to remove.
          </p>
          <Form.Group className="mb-2">
            <Form.Label>Tag</Form.Label>
            <Form.Control value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="e.g. client-work" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setTagOpen(false)}>
            Cancel
          </Button>
          <Button variant="outline-danger" disabled={toolbarBusy} onClick={() => void removeTag()}>
            Remove
          </Button>
          <Button variant="primary" disabled={toolbarBusy} onClick={() => void applyTag()}>
            Add tag
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
}
