import provisionTeamWorkspace from './provisionTeamWorkspace.ts';

/**
 * After Stripe Checkout completes for a team plan: create Appwrite team, `teams` row, owner membership, account patch.
 *
 * @param {object} ctx
 * @param {import('stripe').Stripe} ctx.stripe
 * @param {import('node-appwrite').Databases} ctx.databases
 * @param {import('node-appwrite').Teams} ctx.teams
 * @param {string} ctx.userId
 * @param {string} ctx.sessionId
 */
export default async function finalizeTeamCheckout(ctx) {
  const { stripe, databases, teams, userId, sessionId } = ctx;
  const sid = String(sessionId || '').trim();
  if (!sid) {
    throw Object.assign(new Error('sessionId is required'), { statusCode: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(sid, {
    expand: ['subscription'],
  });
  if (session.mode !== 'subscription') {
    throw Object.assign(new Error('Invalid checkout session mode'), { statusCode: 400 });
  }
  const meta = session.metadata || {};
  if (String(meta.wphub_checkout || '').trim() !== 'team_plan') {
    throw Object.assign(new Error('Not a team plan checkout session'), { statusCode: 400 });
  }
  const uid = String(meta.appwrite_owner_id || meta.appwrite_user_id || '').trim();
  if (!uid || uid !== String(userId).trim()) {
    throw Object.assign(new Error('Session does not belong to this user'), { statusCode: 403 });
  }

  const teamName = String(meta.team_name || session.customer_details?.name || 'Team').trim() || 'Team';
  const initialSeats = Math.max(1, Math.min(999, Number(meta.initial_seats) || 1));

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId || !String(customerId).startsWith('cus_')) {
    throw Object.assign(new Error('Missing Stripe customer on session'), { statusCode: 400 });
  }

  const subRaw = session.subscription;
  const subIdFromSession =
    typeof subRaw === 'string' ? subRaw : subRaw && typeof subRaw.id === 'string' ? subRaw.id : '';
  const subscription = subIdFromSession
    ? await stripe.subscriptions.retrieve(subIdFromSession, { expand: ['items.data.price.product'] })
    : null;
  const subId = subscription && typeof subscription.id === 'string' ? subscription.id : '';

  const item0 = subscription?.items?.data?.[0];
  const price = item0?.price;
  const prod = price && typeof price.product === 'object' && price.product && !('deleted' in price.product) ? price.product : null;
  const currentPlan =
    (prod && typeof prod.id === 'string' && prod.id) ||
    (typeof price?.product === 'string' ? price.product : null) ||
    null;

  return provisionTeamWorkspace({
    databases,
    teams,
    stripe,
    teamName,
    ownerUserId: uid,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subId,
    maxSeats: initialSeats,
    currentPlan,
  });
};
