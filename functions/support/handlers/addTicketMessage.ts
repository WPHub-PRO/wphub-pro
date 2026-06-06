import { ok, fail, stripHtmlToPlainText } from '@code045/wphubpro-shared';
import { getTicket, createMessage, createActivity, updateTicket } from '../lib/ticketsRepo.ts';
import { emitPlatformEvent } from '@code045/wphubpro-shared';

function canWriteTicket(ticket, actorUserId, isAdmin) {
  if (isAdmin) return true;
  if (ticket.user_id === actorUserId) return true;
  if (ticket.assigned_to_user_id && ticket.assigned_to_user_id === actorUserId) return true;
  if (Array.isArray(ticket.follower_ids) && ticket.follower_ids.includes(actorUserId)) return true;
  return false;
}

async function handleAddTicketMessage(ctx) {
  const { res, databases, users, actorUserId, isAdmin, payload } = ctx;
  const ticketId = String(payload.ticketId || '').trim();
  const body = stripHtmlToPlainText(String(payload.body || ''));
  if (!ticketId) return fail(res, 'ticketId is required', 400);
  if (!body) return fail(res, 'body is required', 400);

  let ticket;
  try {
    ticket = await getTicket(databases, ticketId);
  } catch {
    return fail(res, 'Ticket not found', 404);
  }
  if (!canWriteTicket(ticket, actorUserId, isAdmin)) return fail(res, 'Forbidden', 403);

  // Reporter messages are always user-side. Other admins default to support staff unless asStaff is explicitly false.
  const isTicketReporter = Boolean(ticket.user_id) && String(ticket.user_id) === String(actorUserId);
  let isStaff;
  if (isTicketReporter) {
    isStaff = false;
  } else {
    const explicitAsUser =
      payload.asStaff === false ||
      payload.asStaff === 'false' ||
      (typeof payload.asStaff === 'string' && payload.asStaff.trim().toLowerCase() === 'false');
    isStaff = isAdmin && !explicitAsUser;
  }
  const message = await createMessage(databases, {
    ticket_id: ticket.$id,
    user_id: actorUserId,
    body: body.slice(0, 10000),
    is_staff: isStaff,
  });

  await createActivity(databases, {
    ticket_id: ticket.$id,
    actor_user_id: actorUserId,
    action: isStaff ? 'staff_reply' : 'user_reply',
    summary: isStaff ? 'Staff replied on ticket' : 'User replied on ticket',
    detail_json: null,
  });

  if (!isStaff && (ticket.status === 'resolved' || ticket.status === 'closed')) {
    await updateTicket(databases, ticket.$id, { status: 'open' });
  }

  try {
    if (isStaff && ticket.user_id) {
      await emitPlatformEvent(databases, { users: ctx.users, teams: null }, {
        eventKey: 'ticket_reply',
        recipientUserId: String(ticket.user_id),
        payload: {
          title: 'New reply on your support ticket',
          body: 'Support replied to your ticket. Open Support to read the full message.',
          ticketId: ticket.$id,
          messageId: message.$id,
          from: 'staff',
        },
      });
    } else if (ticket.assigned_to_user_id) {
      await emitPlatformEvent(databases, { users: ctx.users, teams: null }, {
        eventKey: 'ticket_reply',
        recipientUserId: String(ticket.assigned_to_user_id),
        payload: {
          title: 'New reply on a ticket you follow',
          body: 'A customer replied on a ticket assigned to you.',
          ticketId: ticket.$id,
          messageId: message.$id,
          from: 'reporter',
        },
      });
    }
  } catch {
    /* best-effort */
  }

  return ok(res, { success: true, message }, 201);
}

export { handleAddTicketMessage };