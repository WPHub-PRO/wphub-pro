import { ok, fail } from '@code045/wphubpro-shared';
import { getTicket, updateTicket, createActivity, reassignGuestMessagesToUser } from '../lib/ticketsRepo.ts';
import { emitPlatformEvent } from '@code045/wphubpro-shared';

const ALLOWED_STATUS = new Set(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high', 'urgent']);

async function handleUpdateTicketStatus(ctx) {
  const { res, databases, users, actorUserId, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: Admin access required', 403);

  const ticketId = String(payload.ticketId || '').trim();
  if (!ticketId) return fail(res, 'ticketId is required', 400);

  let ticket;
  try {
    ticket = await getTicket(databases, ticketId);
  } catch {
    return fail(res, 'Ticket not found', 404);
  }

  const patch = {};
  if (payload.status !== undefined) {
    const status = String(payload.status || '').trim();
    if (!ALLOWED_STATUS.has(status)) return fail(res, 'Invalid status', 400);
    patch.status = status;
  }
  if (payload.priority !== undefined) {
    const priority = String(payload.priority || '').trim();
    if (!ALLOWED_PRIORITY.has(priority)) return fail(res, 'Invalid priority', 400);
    patch.priority = priority;
  }
  if (payload.assignedToUserId !== undefined) {
    const next = String(payload.assignedToUserId || '').trim();
    patch.assigned_to_user_id = next || null;
  }
  if (payload.reporterUserId !== undefined) {
    if (ticket.user_id) {
      return fail(res, 'Ticket already has a reporter account linked', 400);
    }
    const nextReporter = String(payload.reporterUserId || '').trim();
    if (!nextReporter) {
      return fail(res, 'reporterUserId is required when linking a guest ticket to a user', 400);
    }
    try {
      await users.get(nextReporter);
    } catch {
      return fail(res, 'User not found', 404);
    }
    patch.user_id = nextReporter;
    patch.guest_from_email = null;
    const followers = Array.isArray(ticket.follower_ids) ? [...ticket.follower_ids] : [];
    if (!followers.includes(nextReporter)) followers.push(nextReporter);
    patch.follower_ids = followers;
  }

  if (Object.keys(patch).length === 0) return fail(res, 'No update fields provided', 400);

  const statusBefore = ticket.status;
  const priorityBefore = ticket.priority;
  const userIdBefore = ticket.user_id || null;
  const guestBefore = ticket.guest_from_email || null;
  const updated = await updateTicket(databases, ticket.$id, patch);
  if (guestBefore && patch.user_id) {
    await reassignGuestMessagesToUser(databases, ticket.$id, guestBefore, String(patch.user_id));
  }
  await createActivity(databases, {
    ticket_id: ticket.$id,
    actor_user_id: actorUserId,
    action: 'ticket_updated',
    summary: patch.user_id && !userIdBefore ? 'Guest ticket linked to user account' : 'Ticket status/assignment updated',
    detail_json: JSON.stringify({
      before: {
        status: ticket.status,
        priority: ticket.priority,
        assigned_to_user_id: ticket.assigned_to_user_id || null,
        user_id: userIdBefore,
        guest_from_email: guestBefore,
      },
      after: {
        status: updated.status,
        priority: updated.priority,
        assigned_to_user_id: updated.assigned_to_user_id || null,
        user_id: updated.user_id || null,
        guest_from_email: updated.guest_from_email || null,
      },
    }).slice(0, 4000),
  });

  try {
    const uid = ticket.user_id ? String(ticket.user_id) : '';
    if (uid && payload.status !== undefined && String(updated.status) !== String(statusBefore)) {
      await emitPlatformEvent(databases, { users, teams: null }, {
        eventKey: 'ticket_status',
        recipientUserId: uid,
        payload: {
          title: 'Support ticket status updated',
          body: `Your ticket is now: ${updated.status}.`,
          ticketId: ticket.$id,
          from: statusBefore,
          to: updated.status,
        },
      });
    }
    if (uid && payload.priority !== undefined && String(updated.priority) !== String(priorityBefore)) {
      await emitPlatformEvent(databases, { users, teams: null }, {
        eventKey: 'ticket_priority',
        recipientUserId: uid,
        payload: {
          title: 'Support ticket priority updated',
          body: `Priority is now: ${updated.priority}.`,
          ticketId: ticket.$id,
          from: priorityBefore,
          to: updated.priority,
        },
      });
    }
  } catch {
    /* best-effort */
  }

  return ok(res, { success: true, ticket: updated });
}

export { handleUpdateTicketStatus };