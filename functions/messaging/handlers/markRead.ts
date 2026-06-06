import { ok, fail } from '@code045/wphubpro-shared';
import { markRead } from '../lib/services/notificationInbox.ts';

async function handleMarkRead(ctx) {
  const { res, actorUserId, payload } = ctx;
  const notificationId = String(payload?.notificationId || '').trim();
  if (!notificationId) return fail(res, 'notificationId is required', 400);

  try {
    await markRead({
      databases: ctx.databases,
      actorUserId,
      notificationId,
    });
  } catch (e) {
    const code = e && e.statusCode;
    if (code === 403) return fail(res, 'Forbidden', 403);
    if (code === 404 || /not found/i.test(String(e.message || ''))) {
      return fail(res, 'Notification not found', 404);
    }
    throw e;
  }

  return ok(res, { success: true });
}

export { handleMarkRead };