import { ok, fail } from '@code045/wphubpro-shared';
import { listUserSummaries } from '../lib/userSummary.ts';

async function handleListAgents(ctx) {
  const { res, teams, users, isAdmin } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: Admin access required', 403);

  let memberships = [];
  try {
    const out = await teams.listMemberships('admin');
    memberships = out.memberships || [];
  } catch {
    memberships = [];
  }
  const userIds = memberships.map((m) => m.userId).filter(Boolean);
  const agents = await listUserSummaries(users, userIds);
  return ok(res, { success: true, agents });
}

export { handleListAgents };