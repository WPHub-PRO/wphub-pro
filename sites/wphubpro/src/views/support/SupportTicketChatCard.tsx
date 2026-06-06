import UserAvatar from '@/components/user/UserAvatar';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useEffectiveIsAdmin } from '@/context/useEffectiveIsAdmin';
import { useAuth } from '@/domains/auth';
import { useAddTicketMessage } from '@/domains/tickets';
import type { TicketMessage, TicketRecentFromReporter } from '@/types';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardHeader, Spinner } from 'react-bootstrap';
import SimpleBar from 'simplebar-react';
import { TbClock, TbSend2 } from 'react-icons/tb';
import { Link } from 'react-router';
import { stripHtmlToText } from '@/views/inbox/mailComposeUtils';
import { formatTicketStatus, statusBadgeClass } from '@/views/support/supportUi';

type Props = {
  ticketId: string;
  /** Appwrite user id of the ticket reporter — used so admins replying on their own ticket send as user, not staff. */
  ticketUserId?: string | null;
  messages: TicketMessage[];
  /** Last tickets from the reporter (admin view); shown below the reply box. */
  recentFromReporter?: TicketRecentFromReporter[];
  showRecentFromUser?: boolean;
};

export function SupportTicketChatCard({
  ticketId,
  ticketUserId,
  messages,
  recentFromReporter = [],
  showRecentFromUser = false,
}: Props) {
  const { user } = useAuth();
  const effectiveAdmin = useEffectiveIsAdmin();
  const add = useAddTicketMessage();
  const [input, setInput] = useState('');

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !user) return;
    /** Staff reply only when admin is *not* the ticket owner (support handling someone else's ticket). */
    const asStaff = effectiveAdmin && user.$id !== ticketUserId;
    add.mutate(
      { ticketId, body: text, asStaff },
      {
        onSuccess: () => setInput(''),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <h4 className="card-title mb-0">Conversation</h4>
      </CardHeader>

      <SimpleBar className="card-body py-0" style={{ height: '380px' }} id="ticket-chat">
        {messages.map((m) => {
          const mine = m.userId === user?.$id;
          const fromReporter = m.userId === ticketUserId;
          /** Staff styling only for support-side replies, not the ticket reporter (even if legacy row had is_staff). */
          const showAsStaff = m.isStaff && !fromReporter;
          const t = new Date(m.$createdAt);
          const timeStr = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          const authorLabel =
            m.userName?.trim() || (showAsStaff ? 'Support' : 'User');
          const authorInitial = authorLabel.charAt(0).toUpperCase();
          return (
            <div
              key={m.$id}
              className={`d-flex align-items-start gap-2 my-3 chat-item${mine ? ' text-end justify-content-end' : ''}`}
            >
              {!mine && (
                <span className="avatar-xs rounded-circle bg-secondary-subtle d-inline-flex align-items-center justify-content-center flex-shrink-0 mt-1 small">
                  {authorInitial}
                </span>
              )}
              <div>
                <div
                  className={`chat-message py-2 px-3 rounded ${mine ? 'bg-info-subtle' : showAsStaff ? 'bg-warning-subtle' : 'bg-light'}`}
                >
                  {stripHtmlToText(m.body)}
                </div>
                <div className="text-muted fs-xs mt-1 d-inline-flex align-items-center gap-1">
                  <TbClock /> {timeStr}
                  {!mine ? <span className="ms-1">· {authorLabel}</span> : null}
                </div>
              </div>
              {mine && user ? (
                <UserAvatar user={user} sizePx={28} className="rounded-circle flex-shrink-0 mt-1" title="You" />
              ) : null}
            </div>
          );
        })}
      </SimpleBar>

      <div className="card-footer bg-body-secondary border-top border-dashed border-bottom-0">
        <form className="d-flex gap-2" onSubmit={handleSend}>
          <div className="app-search flex-grow-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="form-control bg-light-subtle border-light"
              placeholder="Write a reply…"
              disabled={add.isPending}
            />
          </div>
          <Button type="submit" variant="primary" disabled={add.isPending || !input.trim()}>
            {add.isPending ? <Spinner animation="border" size="sm" /> : <TbSend2 />}
          </Button>
        </form>
      </div>

      {showRecentFromUser && recentFromReporter.length > 0 ? (
        <div className="card-footer bg-body-tertiary border-top pt-3 pb-3">
          <h6 className="text-uppercase text-muted fs-xs mb-2">Recent tickets from this user</h6>
          <ul className="list-unstyled mb-0 small">
            {recentFromReporter.map((t, i) => (
              <li
                key={t.$id}
                className={
                  i < recentFromReporter.length - 1 ? 'mb-2 pb-2 border-bottom border-light-subtle' : ''
                }
              >
                <Link
                  to={ROUTE_PATHS.supportTicketPath(t.$id)}
                  className="text-decoration-none text-body d-block"
                >
                  <span className="fw-medium text-truncate d-block">{t.subject}</span>
                  <span className="d-inline-flex align-items-center gap-2 mt-1 text-muted">
                    <Badge className={statusBadgeClass(t.status)}>{formatTicketStatus(t.status)}</Badge>
                    <span>{new Date(t.$updatedAt).toLocaleString()}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
