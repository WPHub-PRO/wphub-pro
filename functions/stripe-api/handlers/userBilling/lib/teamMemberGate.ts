import { listUserMemberships, userIsMemberOnlyOnTeam } from '@code045/wphubpro-shared';
import { fetchPlatformAccountDoc } from '../../../lib/platformAccount.ts';
import { appwriteUsers } from './helpers.ts';
import type { UserBillingActionKey } from '../../../lib/types.ts';

const TEAM_MEMBER_READONLY: ReadonlySet<UserBillingActionKey> = new Set([
  'get-subscription',
  'get-subscription-details',
  'get-customer',
  'list-invoices',
  'list-payment-methods',
  'list-customer-tax-ids',
]);

export async function assertTeamMemberBillingAccess(
  databases: import('@code045/wphubpro-shared').Databases,
  userId: string,
  body: Record<string, unknown>,
  action: UserBillingActionKey,
): Promise<{ blocked: false } | { blocked: true; skipped?: boolean; reason?: string }> {
  const accDoc = await fetchPlatformAccountDoc(databases, userId);
  const usersApi = appwriteUsers();
  const mems = await listUserMemberships(usersApi, userId);
  const active = String(accDoc?.active_team_id || '').trim();
  const memberOnlyWorkspace = active && userIsMemberOnlyOnTeam(mems, active, userId);
  const entityTypeForGate = String(body?.entityType ?? 'user')
    .trim()
    .toLowerCase();
  const teamMemberPersonalReadonly =
    memberOnlyWorkspace && entityTypeForGate === 'user' && TEAM_MEMBER_READONLY.has(action);

  if (memberOnlyWorkspace && action !== 'list-plans' && !teamMemberPersonalReadonly) {
    if (action === 'ensure-customer') {
      return { blocked: true, skipped: true, reason: 'team_member' };
    }
    return { blocked: true };
  }
  return { blocked: false };
}
