import { WPHUB_APPWRITE_IDS, Query, ID, Permission, Role } from '@code045/wphubpro-shared';
import platformTeamsTableId from './platformTeamsTableId.ts';
import { fetchPlatformAccountDoc } from './platformAccount.ts';
import syncTeamStripeCustomerMetadata from './syncTeamStripeCustomerMetadata.ts';

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function accountsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.accounts;
}

function teamsTableId() {
  return platformTeamsTableId();
}

/**
 * Create Appwrite team, owner membership, `teams` collection row (document id = team id), and patch/create platform account.
 *
 * @param {object} ctx
 * @param {import('node-appwrite').Databases} ctx.databases
 * @param {import('node-appwrite').Teams} ctx.teams
 * @param {string} ctx.teamName
 * @param {string} ctx.ownerUserId Appwrite user id
 * @param {string} ctx.stripeCustomerId `cus_…`
 * @param {string} [ctx.stripeSubscriptionId] `sub_…` or empty
 * @param {number} ctx.maxSeats clamped 1–999
 * @param {string | null} [ctx.currentPlan] Stripe product id
 * @param {import('stripe').Stripe} [ctx.stripe] When set, updates the team Stripe customer metadata (`appwrite_owner_id`, `appwrite_team_id`).
 * @returns {Promise<{ success: true; teamId: string; teamName: string; stripeCustomerId: string }>}
 */
export default async function provisionTeamWorkspace(ctx) {
  const {
    databases,
    teams,
    teamName,
    ownerUserId,
    stripeCustomerId,
    stripeSubscriptionId,
    maxSeats,
    currentPlan,
    stripe,
  } = ctx;
  const uid = String(ownerUserId || '').trim();
  if (!uid) {
    throw Object.assign(new Error('Owner user id is required'), { statusCode: 400 });
  }
  const customerId = String(stripeCustomerId || '').trim();
  if (!customerId.startsWith('cus_')) {
    throw Object.assign(new Error('Valid Stripe customer id (cus_…) is required'), { statusCode: 400 });
  }
  const nSeats = Math.max(1, Math.min(999, Math.floor(Number(maxSeats)) || 1));
  const name = String(teamName || 'Team').trim() || 'Team';
  const subId = stripeSubscriptionId ? String(stripeSubscriptionId).trim() : '';
  const planId = currentPlan != null && String(currentPlan).trim() ? String(currentPlan).trim() : null;

  await fetchPlatformAccountDoc(databases, uid);

  const teamId = ID.unique();
  const createdTeam = await teams.create({ teamId, name });
  const tid = createdTeam.$id;

  await teams.createMembership({
    teamId: tid,
    userId: uid,
    roles: ['owner'],
  });

  const tColl = teamsTableId();
  const perms = [
    Permission.read(Role.team(tid)),
    Permission.update(Role.team(tid, ['owner'])),
    Permission.delete(Role.team(tid, ['owner'])),
  ];
  await databases.createDocument(dbId(), tColl, ID.custom(tid), {
    stripe_customer_id: customerId,
    stripe_subscription_id: subId || null,
    max_seats: nSeats,
    owner_id: uid,
    current_plan: planId,
  }, perms);

  const list = await databases.listDocuments(dbId(), accountsColl(), [
    Query.equal('user_id', uid),
    Query.limit(1),
  ]);
  const accDoc = list.documents?.[0];
  const patch = {
    active_team_id: tid,
  };
  if (accDoc && accDoc.stripe_customer_id && String(accDoc.stripe_customer_id).startsWith('cus_')) {
    patch.stripe_customer_id = accDoc.stripe_customer_id;
  }
  if (accDoc && accDoc.$id) {
    await databases.updateDocument(dbId(), accountsColl(), accDoc.$id, patch);
  } else {
    await databases.createDocument(dbId(), accountsColl(), ID.unique(), {
      user_id: uid,
      ...patch,
    });
  }

  if (stripe && typeof stripe.customers?.update === 'function') {
    try {
      await syncTeamStripeCustomerMetadata({
        stripe,
        customerId,
        ownerUserId: uid,
        teamId: tid,
      });
    } catch {
      /* non-fatal: Appwrite team is already provisioned */
    }
  }

  return { success: true, teamId: tid, teamName: createdTeam.name, stripeCustomerId: customerId };
};
