import CustomQuill from '@/components/CustomQuill.tsx';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useMailboxSendMutation } from '@/domains/mailbox/useMailboxQueries';
import useToggle from '@/hooks/useToggle';
import {
  buildOutgoingHtmlFromParts,
  isEffectivelyEmptyHtml,
  MAIL_COMPOSE_FORWARD_SEP,
  MAIL_COMPOSE_REPLY_SEP,
  plainTextToSimpleHtml,
  sanitizeEmailQuoteHtml,
  stripHtmlToText,
  type MailComposeLocationState,
} from '@/views/inbox/mailComposeUtils';
import MailHtmlFrame from '@/views/inbox/MailHtmlFrame';
import { useInboxLayout } from '@/views/inbox/inboxLayoutContext';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Collapse,
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  OverlayTrigger,
  Spinner,
  Tooltip,
} from 'react-bootstrap';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LuSearch } from 'react-icons/lu';
import { TbChevronDown, TbMenu2, TbSend2, TbSettings, TbTrash, TbX } from 'react-icons/tb';
import SimpleBar from 'simplebar-react';

const composeQuillModules = {
  toolbar: [
    [{ header: [false, 1, 2, 3] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    ['blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
  ],
};

export default function WorkspaceInboxComposePane() {
  const sendM = useMailboxSendMutation();
  const location = useLocation();
  const navigate = useNavigate();
  const { toggleMailSidebar } = useInboxLayout();
  const presetAppliedKey = useRef<string | null>(null);

  const { isTrue: isCcOpen, toggle: toggleCc, setFalse: closeCc } = useToggle();
  const { isTrue: isBccOpen, toggle: toggleBcc, setFalse: closeBcc } = useToggle();

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  /** Rich message typed by the user (quoted reply/forward is appended separately). */
  const [bodyHtml, setBodyHtml] = useState('');
  /** HTML merged after the user block when replying/forwarding (sanitized original or escaped plain). */
  const [quotedAppendHtml, setQuotedAppendHtml] = useState<string | null>(null);
  const [inReplyTo, setInReplyTo] = useState('');
  const [references, setReferences] = useState('');

  useEffect(() => {
    const st = location.state as MailComposeLocationState | null;
    const preset = st?.mailCompose;
    if (!preset) {
      setQuotedAppendHtml(null);
      presetAppliedKey.current = null;
      return;
    }
    const key = `${preset.messageKey || ''}:${preset.mode}:${preset.subject}:${preset.messageId || ''}`;
    if (presetAppliedKey.current === key) return;
    presetAppliedKey.current = key;

    let append: string | null = null;
    if (preset.bodyHtml?.trim()) {
      append = sanitizeEmailQuoteHtml(preset.bodyHtml.trim());
    }
    if (!append && preset.body?.trim()) {
      const sep = preset.mode === 'forward' ? MAIL_COMPOSE_FORWARD_SEP : MAIL_COMPOSE_REPLY_SEP;
      append = plainTextToSimpleHtml(`${sep}${preset.body.trim()}`);
    }
    setQuotedAppendHtml(append);

    if (preset.mode === 'reply') {
      setTo(preset.to?.trim() || '');
      const subj = preset.subject?.trim() || '';
      setSubject(subj.toLowerCase().startsWith('re:') ? subj : subj ? `Re: ${subj}` : 'Re:');
      setBodyHtml('');
      setInReplyTo(preset.messageId?.trim() || '');
      setReferences(
        [preset.references?.trim(), preset.messageId?.trim()].filter(Boolean).join(' ').trim() || preset.messageId?.trim() || '',
      );
    } else {
      setTo('');
      const subj = preset.subject?.trim() || '';
      setSubject(subj.toLowerCase().startsWith('fwd:') ? subj : subj ? `Fwd: ${subj}` : 'Fwd:');
      setBodyHtml('');
      setInReplyTo('');
      setReferences('');
    }
  }, [location.state]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Multipart HTML is built here; text/plain is derived for clients without HTML. user-mailbox strips
    // <script> on send — pasted HTML can still carry other risks until server hardening expands.
    const html = buildOutgoingHtmlFromParts(bodyHtml, quotedAppendHtml);
    if (!html.trim()) return;
    const text = stripHtmlToText(html);
    sendM.mutate({
      to: to.trim(),
      subject: subject.trim(),
      text: text || undefined,
      html: html || undefined,
      in_reply_to: inReplyTo.trim() || undefined,
      references: references.trim() || undefined,
    });
  };

  const onDiscard = () => {
    if (sendM.isPending) return;
    if (to.trim() || subject.trim() || !isEffectivelyEmptyHtml(bodyHtml) || quotedAppendHtml) {
      if (!window.confirm('Discard this message?')) return;
    }
    navigate(ROUTE_PATHS.INBOX);
  };

  return (
    <Card className="h-100 mb-0 rounded-start-0 flex-grow-1 border-start-0 d-flex flex-column min-h-0">
      <CardHeader className="d-lg-none d-flex gap-2 flex-shrink-0">
        <button className="btn btn-default btn-icon" type="button" onClick={() => toggleMailSidebar()} aria-label="Menu">
          <TbMenu2 className="fs-lg" />
        </button>
        <div className="app-search flex-grow-1">
          <input type="text" className="form-control" placeholder="Search mails..." readOnly tabIndex={-1} />
          <LuSearch className="app-search-icon text-muted" />
        </div>
      </CardHeader>
      <CardHeader className="card-bg justify-content-between flex-shrink-0">
        <CardTitle as="h4" className="mb-0">
          Compose Message
        </CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit} className="d-flex flex-column flex-grow-1 min-h-0">
        <SimpleBar
          className="card-body p-0 flex-grow-1 min-h-0"
          style={{ minHeight: 200 }}
          data-simplebar
          data-simplebar-md>
          {sendM.isSuccess && sendM.data?.success && (
            <Alert variant="success" className="m-3 mb-0">
              Message sent.
            </Alert>
          )}
          {sendM.isError && (
            <Alert variant="danger" className="m-3 mb-0 small">
              {(sendM.error as Error)?.message || 'Send failed'}
            </Alert>
          )}
          <div className="app-search input-group border-bottom border-dashed ps-2 pe-4">
            <input
              type="text"
              className="form-control py-3 border-0"
              placeholder="Enter emails.."
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
            />
            <span className="app-search-icon fw-semibold fs-sm">To:</span>
            <button className="btn btn-link fs-sm px-2 text-decoration-underline text-reset fw-semibold" type="button" onClick={toggleCc}>
              Cc
            </button>
            <button className="btn btn-link fs-sm px-2 text-decoration-underline text-reset fw-semibold" type="button" onClick={toggleBcc}>
              Bcc
            </button>
          </div>
          <Collapse in={isCcOpen}>
            <div className="app-search input-group border-bottom border-dashed ps-2 pe-4">
              <input type="text" className="form-control py-3 border-0" placeholder="Not available (use comma-separated To)" readOnly />
              <span className="app-search-icon fw-semibold fs-sm">Cc:</span>
              <button className="btn btn-link px-2 text-muted fw-semibold" type="button" onClick={closeCc} aria-label="Close Cc">
                <TbX className="fs-xl" />
              </button>
            </div>
          </Collapse>
          <Collapse in={isBccOpen}>
            <div className="app-search input-group border-bottom border-dashed ps-2 pe-4">
              <input type="text" className="form-control py-3 border-0" placeholder="Not available (SMTP pipe: To only)" readOnly />
              <span className="app-search-icon fw-semibold fs-sm">Bcc:</span>
              <button className="btn btn-link px-2 text-muted fw-semibold" type="button" onClick={closeBcc} aria-label="Close Bcc">
                <TbX className="fs-xl" />
              </button>
            </div>
          </Collapse>
          <div className="border-bottom border-dashed ps-2 pe-4">
            <input
              type="text"
              className="form-control py-3 fs-sm fw-semibold border-0"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div className="email-editor px-2 pb-2">
            <Suspense
              fallback={
                <div className="d-flex align-items-center justify-content-center py-5 text-muted gap-2">
                  <Spinner animation="border" size="sm" /> Loading editor…
                </div>
              }>
              <CustomQuill
                theme="snow"
                modules={composeQuillModules}
                value={bodyHtml}
                onChange={setBodyHtml}
                className="border-0 rounded-0 compose-mail-quill"
                style={{ minHeight: 280 }}
              />
            </Suspense>
          </div>
          {quotedAppendHtml ? (
            <div className="px-2 pb-3">
              <div className="text-muted small mb-1">Quoted / forwarded</div>
              <MailHtmlFrame html={quotedAppendHtml} title="Quoted message" />
            </div>
          ) : null}
        </SimpleBar>
        <div className="flex-shrink-0 border-top bg-body-secondary position-sticky bottom-0 z-1 mt-auto">
          <div className="p-2">
            <div className="d-flex gap-1 align-items-center flex-wrap">
              <Dropdown className="btn-group">
                <Button variant="primary" type="submit" disabled={sendM.isPending}>
                  {sendM.isPending ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <TbSend2 className="me-2" /> Send
                    </>
                  )}
                </Button>
                <DropdownToggle
                  as="button"
                  variant="primary"
                  type="button"
                  className="btn btn-primary dropdown-toggle dropdown-toggle-split drop-arrow-none"
                  disabled={sendM.isPending}
                  aria-haspopup
                  aria-expanded={false}>
                  <TbChevronDown className="ti ti-chevron-down align-middle" />
                </DropdownToggle>
                <DropdownMenu>
                  <DropdownItem as="button" type="button" disabled>
                    Send &amp; Archive
                  </DropdownItem>
                  <DropdownItem as="button" type="button" disabled>
                    Schedule Send
                  </DropdownItem>
                  <DropdownItem as="button" type="button" disabled>
                    Save as Draft
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem as="button" type="button" onClick={onDiscard}>
                    Discard
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
              <OverlayTrigger overlay={<Tooltip>SMTP is configured in workspace email settings</Tooltip>} placement="top">
                <button type="button" className="btn btn-sm btn-icon btn-light ms-auto" aria-label="Settings info">
                  <TbSettings />
                </button>
              </OverlayTrigger>
              <OverlayTrigger overlay={<Tooltip>Discard and return to inbox</Tooltip>} placement="top">
                <button type="button" className="btn btn-sm btn-icon btn-soft-danger" onClick={onDiscard} aria-label="Discard">
                  <TbTrash />
                </button>
              </OverlayTrigger>
            </div>
          </div>
          <div className="px-3 pb-3 pt-0">
            <Link to={ROUTE_PATHS.INBOX} className="btn btn-link btn-sm px-0">
              Back to Inbox
            </Link>
          </div>
        </div>
      </form>
    </Card>
  );
}
