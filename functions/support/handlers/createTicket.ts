import { ok, fail, stripHtmlToPlainText } from '@code045/wphubpro-shared';
import { createTicket, createMessage, createActivity } from '../lib/ticketsRepo.ts';

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const ALLOWED_NOTIFY = new Set(['platform', 'email', 'both']);

function trimOrEmpty(v) {
  return String(v || '').trim();
}

async function handleCreateTicket(ctx) {
  const { res, databases, actorUserId, isAdmin, payload } = ctx;
  const subject = trimOrEmpty(payload.subject);
  if (!subject) return fail(res, 'subject is required', 400);

  const body = stripHtmlToPlainText(trimOrEmpty(payload.body));
  const priority = ALLOWED_PRIORITIES.has(String(payload.priority || '')) ? String(payload.priority) : 'medium';
  const notifyChannel = ALLOWED_NOTIFY.has(String(payload.notifyChannel || ''))
    ? String(payload.notifyChannel)
    : 'platform';
  const targetUserId = isAdmin && trimOrEmpty(payload.targetUserId) ? trimOrEmpty(payload.targetUserId) : actorUserId;

  const data = {
    user_id: targetUserId,
    subject: subject.slice(0, 500),
    status: 'open',
    priority,
    category: trimOrEmpty(payload.category) || undefined,
    site_id: trimOrEmpty(payload.siteId) || undefined,
    assigned_to_user_id: null,
    context_json: payload.context ? JSON.stringify(payload.context).slice(0, 10000) : undefined,
    notify_channel: notifyChannel,
    follower_ids: [actorUserId],
  };

  const ticket = await createTicket(databases, data);
  if (body) {
    await createMessage(databases, {
      ticket_id: ticket.$id,
      user_id: actorUserId,
      body: body.slice(0, 10000),
      is_staff: !!isAdmin,
    });
  }
  await createActivity(databases, {
    ticket_id: ticket.$id,
    actor_user_id: actorUserId,
    action: 'ticket_created',
    summary: `Ticket created: ${ticket.subject}`.slice(0, 500),
    detail_json: null,
  });

  return ok(res, { success: true, ticket }, 201);
}

export { handleCreateTicket };