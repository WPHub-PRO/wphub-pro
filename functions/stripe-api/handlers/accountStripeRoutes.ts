/**
 * Legacy account-facing routes used by `src/hooks/usePlans`, `useSubscription`, `useInvoices`
 * (same shapes as `src/api/stripe` server helpers).
 */
import {
  hydrateInvoiceLineProducts,
  hydrateSubscriptionFirstItemProducts,
} from '../lib/hydrateSubscriptionProducts.ts';
import { getStripe } from '../lib/stripeClient.ts';
import {requireAppwriteServerTriple, Client, Databases, Users} from '@code045/wphubpro-shared';
import { assertCustomerOrTeamStripeAccess } from '../lib/billingEntity.ts';

const SUBSCRIPTION_EXPAND = [
  'latest_invoice',
  'latest_invoice.payment_intent',
  'items.data.price.product',
  'default_payment_method',
  'customer',
];

async function getPublicCatalogPlans() {
  const stripe = getStripe();
  const products = await stripe.products.list({ active: true, limit: 100 });
  const plans = [];
  for (const product of products.data) {
    const prices = await stripe.prices.list({ active: true, product: product.id, limit: 100 });
    for (const price of prices.data) {
      if (price.recurring) {
        plans.push({ product, price });
      }
    }
  }
  return { plans };
}

async function appwriteDatabasesFromReq(req) {
  const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(req);
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new Databases(client);
}

async function appwriteUsersFromReq(req) {
  const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(req);
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  return new Users(client);
}

async function listCustomerSubscriptions(userId, customerId, req) {
  const databases = await appwriteDatabasesFromReq(req);
  const users = await appwriteUsersFromReq(req);
  await assertCustomerOrTeamStripeAccess({ databases, req, userId, customerId, users });
  const stripe = getStripe();
  const page = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
    expand: ['data.default_payment_method', 'data.items.data.price', 'data.latest_invoice'],
  });
  await hydrateSubscriptionFirstItemProducts(stripe, page.data);
  return { subscriptions: page.data, data: page.data };
}

async function listCustomerInvoices(userId, customerId, req) {
  const databases = await appwriteDatabasesFromReq(req);
  const users = await appwriteUsersFromReq(req);
  await assertCustomerOrTeamStripeAccess({ databases, req, userId, customerId, users });
  const stripe = getStripe();
  const list = await stripe.invoices.list({
    customer: customerId,
    limit: 50,
    expand: ['data.payment_intent', 'data.charge', 'data.lines.data.price', 'data.customer'],
  });
  await hydrateInvoiceLineProducts(stripe, list.data);
  return { invoices: list.data, data: list.data };
}

function shapeSubscriptionPostResult(sub) {
  const inv = sub.latest_invoice;
  const invObj = typeof inv === 'object' && inv && !('deleted' in inv) ? inv : null;
  const pi = invObj?.payment_intent;
  const piObj = typeof pi === 'object' && pi && pi.client_secret ? pi : null;
  return {
    success: true,
    subscription: sub,
    clientSecret: piObj?.client_secret ?? null,
    message: piObj?.client_secret ? undefined : 'Subscription updated.',
  };
}

async function postAccountSubscriptions(userId, body, req) {
  const action = String(body?.action ?? '').trim().toLowerCase();
  const customerId = String(body?.customerId ?? '').trim();
  if (!customerId) {
    throw Object.assign(new Error('customerId is required'), { statusCode: 400 });
  }
  const databases = await appwriteDatabasesFromReq(req);
  const users = await appwriteUsersFromReq(req);
  await assertCustomerOrTeamStripeAccess({ databases, req, userId, customerId, users });

  const stripe = getStripe();

  if (action === 'create') {
    const priceId = String(body?.priceId ?? '').trim();
    if (!priceId) throw Object.assign(new Error('priceId is required'), { statusCode: 400 });
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: SUBSCRIPTION_EXPAND,
    });
    return shapeSubscriptionPostResult(sub);
  }

  if (action === 'update') {
    const subscriptionId = String(body?.subscriptionId ?? '').trim();
    const priceId = String(body?.priceId ?? '').trim();
    if (!subscriptionId || !priceId) {
      throw Object.assign(new Error('subscriptionId and priceId are required'), { statusCode: 400 });
    }
    const current = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
    const itemId = current.items.data[0]?.id;
    if (!itemId) throw Object.assign(new Error('Subscription has no line items'), { statusCode: 400 });
    const cust = typeof current.customer === 'string' ? current.customer : current.customer?.id;
    if (cust !== customerId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });

    const sub = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'create_prorations',
      expand: SUBSCRIPTION_EXPAND,
    });
    return shapeSubscriptionPostResult(sub);
  }

  if (action === 'cancel') {
    const subscriptionId = String(body?.subscriptionId ?? '').trim();
    if (!subscriptionId) throw Object.assign(new Error('subscriptionId is required'), { statusCode: 400 });
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    const cust = typeof current.customer === 'string' ? current.customer : current.customer?.id;
    if (cust !== customerId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    return { success: true, message: 'Cancellation scheduled.' };
  }

  throw Object.assign(new Error(`Invalid action: ${action || '(missing)'}`), { statusCode: 400 });
}

export default {
  getPublicCatalogPlans,
  listCustomerSubscriptions,
  listCustomerInvoices,
  postAccountSubscriptions,
};