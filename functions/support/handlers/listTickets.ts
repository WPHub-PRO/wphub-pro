import { ok } from '@code045/wphubpro-shared';
import { listTicketsByUser, listTicketsAll } from '../lib/services/tickets.ts';
import { listUserSummaries } from '../lib/userSummary.ts';

async function handleListTickets(ctx) {
  const { res, databases, users, actorUserId, isAdmin, adminView } = ctx;
  const list = adminView && isAdmin ? await listTicketsAll(databases) : await listTicketsByUser(databases, actorUserId);
  const tickets = list.documents || [];

  if (!(adminView && isAdmin)) {
    return ok(res, { success: true, tickets, total: list.total || tickets.length });
  }

  const reporterIds = tickets.map((t) => t.user_id).filter(Boolean);
  const summaries = await listUserSummaries(users, reporterIds);
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const merged = tickets.map((t) => ({
    ...t,
    reporter: t.user_id
      ? byId.get(t.user_id) || null
      : t.guest_from_email
        ? { id: 'guest', name: t.guest_from_email, email: t.guest_from_email }
        : null,
  }));
  return ok(res, { success: true, tickets: merged, total: list.total || merged.length });
}

export { handleListTickets };