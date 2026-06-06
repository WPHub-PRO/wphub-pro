import { ok, fail } from '@code045/wphubpro-shared';
import { getTicket, deleteTicketCascade } from '../lib/ticketsRepo.ts';

const MAX_PER_REQUEST = 50;

function collectTicketIds(payload) {
  const single = String(payload.ticketId || payload.ticket_id || '').trim();
  const raw = payload.ticketIds ?? payload.ticket_ids;
  const fromArray = Array.isArray(raw) ? raw : [];
  const merged = fromArray.length ? fromArray : single ? [single] : [];
  const ids = merged.map((x) => String(x ?? '').trim()).filter(Boolean);
  return [...new Set(ids)];
}

async function handleDeleteTickets(ctx) {
  const { res, databases, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: Admin access required', 403);

  const ticketIds = collectTicketIds(payload);
  if (!ticketIds.length) {
    return fail(res, 'ticketIds (non-empty array) or ticketId is required', 400);
  }
  if (ticketIds.length > MAX_PER_REQUEST) {
    return fail(res, `At most ${MAX_PER_REQUEST} tickets per request`, 400);
  }

  const deletedTicketIds = [];
  const failed = [];

  for (const ticketId of ticketIds) {
    try {
      await getTicket(databases, ticketId);
    } catch {
      failed.push({ ticketId, message: 'Ticket not found' });
      continue;
    }
    try {
      await deleteTicketCascade(databases, ticketId);
      deletedTicketIds.push(ticketId);
    } catch (e) {
      failed.push({ ticketId, message: e.message || 'Delete failed' });
    }
  }

  if (!deletedTicketIds.length && failed.length) {
    const first = failed[0];
    const code = first.message === 'Ticket not found' ? 404 : 500;
    return fail(res, first.message, code);
  }

  return ok(res, {
    success: true,
    deletedTicketIds,
    failed: failed.length ? failed : undefined,
  });
}

export { handleDeleteTickets };