import { getStripe } from './stripeClient.ts';
import { ensureUserStripeCustomer } from './ensureUserStripeCustomer.ts';
import { hydrateSubscriptionFirstItemProducts } from './hydrateSubscriptionProducts.ts';
import isTeamStripeProduct from './isTeamStripeProduct.ts';
import { resolvePersonalFreePriceId } from './platformPersonalBilling.ts';

const SUBSCRIPTION_EXPAND = [
  'latest_invoice',
  'latest_invoice.payment_intent',
  'items.data.price.product',
  'default_payment_method',
  'customer',
];

/** Active-ish subscription statuses we respect when deciding paid vs free-tier attach. */
const SIGNIFICANT_SUB_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid']);

/**
 * @param {import('stripe').Stripe.Subscription} sub
 * @param {string} freePriceId
 * @returns {boolean} true → do not attach free tier (user already has paid or non-free plan).
 */
function subscriptionBlocksFreeTierAttach(sub, freePriceId) {
  if (!SIGNIFICANT_SUB_STATUSES.has(sub.status)) return false;
  const item0 = sub.items?.data?.[0];
  const price = item0?.price && typeof item0.price === 'object' ? item0.price : null;
  const priceId = price?.id ? String(price.id) : '';
  if (!priceId) return false;
  if (priceId === freePriceId) return false;

  const pref = price?.product;
  const prod =
    pref && typeof pref === 'object' && !('deleted' in pref && pref.deleted)
      ? /** @type {import('stripe').Stripe.Product} */ (pref)
      : null;
  if (isTeamStripeProduct(prod)) return true;
  return true;
}

/**
 * @param {import('stripe').Stripe.Subscription[]} subs
 * @param {string} freePriceId
 */
function hasExistingFreeTierSubscription(subs, freePriceId) {
  return subs.some((s) => {
    if (!SIGNIFICANT_SUB_STATUSES.has(s.status)) return false;
    const item0 = s.items?.data?.[0];
    const price = item0?.price && typeof item0.price === 'object' ? item0.price : null;
    const priceId = price?.id ? String(price.id) : '';
    return priceId === freePriceId;
  });
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {string} customerId
 */
async function listSubscriptionsForDecision(stripe, customerId) {
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
    /** Max 4 path segments for list API — not `data.items.data.price.product`. */
    expand: ['data.items.data.price'],
  });
  const subs = list.data;
  await hydrateSubscriptionFirstItemProducts(stripe, subs);
  return subs;
}

/**
 * @param {object} params
 * @param {import('node-appwrite').Models.Request} params.req
 * @param {import('node-appwrite').Users} params.users
 * @param {import('node-appwrite').Databases} params.databases
 * @param {string} params.userId
 * @param {string} [params.freePriceId]
 */
async function attachConfiguredFreeTierForUser(params) {
  const { req, users, databases, userId } = params;
  const freePriceId = String(params.freePriceId || '').trim() || (await resolvePersonalFreePriceId(req));
  if (!freePriceId) {
    return { attached: false, skipped: true, reason: 'not_configured', freePriceId: '' };
  }

  const stripe = getStripe();
  const { stripeCustomerId, created } = await ensureUserStripeCustomer({
    users,
    databases,
    userId,
  });
  const subs = await listSubscriptionsForDecision(stripe, stripeCustomerId);

  const blocking = subs.some((s) => subscriptionBlocksFreeTierAttach(s, freePriceId));
  if (blocking) {
    return {
      attached: false,
      skipped: true,
      reason: 'has_other_subscription',
      freePriceId,
      stripeCustomerId,
      createdCustomer: created,
    };
  }

  if (hasExistingFreeTierSubscription(subs, freePriceId)) {
    return {
      attached: false,
      skipped: true,
      reason: 'already_attached',
      freePriceId,
      stripeCustomerId,
      createdCustomer: created,
    };
  }

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: freePriceId }],
    payment_behavior: 'default_incomplete',
    expand: SUBSCRIPTION_EXPAND,
  });

  return {
    attached: true,
    skipped: false,
    reason: 'attached',
    freePriceId,
    stripeCustomerId,
    createdCustomer: created,
    subscriptionId: subscription.id,
  };
}

export {
  SUBSCRIPTION_EXPAND,
  SIGNIFICANT_SUB_STATUSES,
  subscriptionBlocksFreeTierAttach,
  hasExistingFreeTierSubscription,
  listSubscriptionsForDecision,
  attachConfiguredFreeTierForUser,
};