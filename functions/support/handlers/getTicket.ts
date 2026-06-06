import { ok, fail } from '@code045/wphubpro-shared';
import { getTicket, listMessages, listActivities, listRecentFromReporter } from '../lib/ticketsRepo.ts';
import { getUserSummary, listUserSummaries } from '../lib/userSummary.ts';

function canReadTicket(ticket, actorUserId, isAdmin) {
  if (isAdmin) return true;
  if (ticket.user_id === actorUserId) return true;
  if (ticket.assigned_to_user_id && ticket.assigned_to_user_id === actorUserId) return true;
  if (Array.isArray(ticket.follower_ids) && ticket.follower_ids.includes(actorUserId)) return true;
  return false;
}

function parseContext(contextJson) {
  if (!contextJson || typeof contextJson !== 'string') return null;
  try {
    return JSON.parse(contextJson);
  } catch {
    return null;
  }
}

async function handleGetTicket(ctx) {
  const { res, databases, users, actorUserId, isAdmin, payload } = ctx;
  const ticketId = String(payload.ticketId || payload.ticket_id || '').trim();
  if (!ticketId) return fail(res, 'ticketId is required', 400);

  let ticket;
  try {
    ticket = await getTicket(databases, ticketId);
  } catch {
    return fail(res, 'Ticket not found', 404);
  }

  if (!canReadTicket(ticket, actorUserId, isAdmin)) {
    return fail(res, 'Forbidden', 403);
  }

  const [messagesList, activitiesList, reporterRaw, assignee] = await Promise.all([
    listMessages(databases, ticket.$id),
    listActivities(databases, ticket.$id),
    getUserSummary(users, ticket.user_id),
    getUserSummary(users, ticket.assigned_to_user_id),
  ]);
  let reporter = reporterRaw;
  if (!reporter && ticket.guest_from_email) {
    reporter = {
      id: 'guest',
      name: String(ticket.guest_from_email),
      email: String(ticket.guest_from_email),
    };
  }
  const messages = messagesList.documents || [];
  const messageAuthorIds = [...new Set(messages.map((m) => m.user_id).filter(Boolean))];
  const authorSummaries = await listUserSummaries(users, messageAuthorIds);
  const authorById = new Map(authorSummaries.map((s) => [s.id, s]));
  const messagesWithAuthor = messages.map((m) => ({
    ...m,
    user_name: authorById.get(m.user_id)?.name || m.guest_from_email || null,
  }));

  const recentFromReporter =
    isAdmin && ticket.user_id
      ? await listRecentFromReporter(databases, ticket.user_id, ticket.$id)
      : [];

  const iFollow = Array.isArray(ticket.follower_ids) && ticket.follower_ids.includes(actorUserId);
  return ok(res, {
    success: true,
    ticket,
    messages: messagesWithAuthor,
    activities: activitiesList.documents || [],
    reporter: reporter || null,
    assignee: assignee || null,
    context: parseContext(ticket.context_json),
    iFollow,
    recentFromReporter: recentFromReporter.map((x) => ({
      $id: x.$id,
      subject: x.subject,
      status: x.status,
      priority: x.priority,
      $updatedAt: x.$updatedAt,
    })),
  });
}

export { handleGetTicket };