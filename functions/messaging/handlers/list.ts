import { ok } from '@code045/wphubpro-shared';
import { listUnread } from '../lib/services/notificationInbox.ts';

async function handleList(ctx) {
  const result = await listUnread(ctx);
  return ok(ctx.res, { success: true, items: result.items, unreadCount: result.unreadCount });
}

export { handleList };