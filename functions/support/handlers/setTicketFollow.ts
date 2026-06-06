import { ok, fail } from '@code045/wphubpro-shared';
import { getTicket, updateTicket } from '../lib/ticketsRepo.ts';

async function handleSetTicketFollow(ctx) {
  const { res, databases, actorUserId, isAdmin, payload } = ctx;
  const ticketId = String(payload.ticketId || '').trim();
  if (!ticketId) return fail(res, 'ticketId is required', 400);

  let ticket;
  try {
    ticket = await getTicket(databases, ticketId);
  } catch {
    return fail(res, 'Ticket not found', 404);
  }

  if (!isAdmin) {
    if (!ticket.user_id || ticket.user_id !== actorUserId) return fail(res, 'Forbidden', 403);
  }

  const current = Array.isArray(ticket.follower_ids) ? [...ticket.follower_ids] : [];
  const follow = payload.follow !== false;
  const next = follow ? [...new Set([...current, actorUserId])] : current.filter((x) => x !== actorUserId);
  const updated = await updateTicket(databases, ticket.$id, { follower_ids: next });

  return ok(res, { success: true, ticket: updated, iFollow: next.includes(actorUserId) });
}

export { handleSetTicketFollow };