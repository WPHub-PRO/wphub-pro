import {
  hydrateInvoiceLineProducts,
  hydrateSubscriptionFirstItemProducts,
} from '../lib/hydrateSubscriptionProducts.ts';
import { getStripe } from '../lib/stripeClient.ts';
import { assertAdmin } from './teamBillingAdmin.ts';

const MAX_SUB_LIST = 500;

/**
 * Admin: subscriptions for a single Stripe customer (Team detail / billing inspect).
 * @param {import('node-appwrite').Models.Request} req
 * @param {string} customerId
 */
async function listStripeSubscriptionsForCustomerAdmin(req, customerId) {
  await assertAdmin(req);
  const cid = String(customerId ?? '').trim();
  if (!cid.startsWith('cus_')) {
    throw Object.assign(new Error('customerId must be a Stripe customer id (cus_…)'), { statusCode: 400 });
  }
  const stripe = getStripe();
  const page = await stripe.subscriptions.list({
    customer: cid,
    status: 'all',
    limit: 50,
    expand: ['data.items.data.price.product', 'data.latest_invoice'],
  });
  await hydrateSubscriptionFirstItemProducts(stripe, page.data);
  return { subscriptions: page.data };
}

async function listStripeSubscriptionsForAdmin() {
  const stripe = getStripe();
  const subscriptions = [];
  let adminSubCursor;
  for (let p = 0; p < 500; p++) {
    const subPage = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      starting_after: adminSubCursor,
      expand: ['data.customer', 'data.items.data.price'],
    });
    await hydrateSubscriptionFirstItemProducts(stripe, subPage.data);
    for (const sub of subPage.data) {
      subscriptions.push(sub);
      if (subscriptions.length >= MAX_SUB_LIST) break;
    }
    if (subscriptions.length >= MAX_SUB_LIST) break;
    if (!subPage.has_more || subPage.data.length === 0) break;
    adminSubCursor = subPage.data[subPage.data.length - 1].id;
  }
  return { subscriptions };
}

async function getStripeSubscriptionForAdmin(subscriptionId) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice', 'latest_invoice.payment_intent', 'items.data.price.product', 'customer'],
  });
  const cust = subscription.customer;
  let customer = null;
  if (typeof cust === 'string') {
    const c = await stripe.customers.retrieve(cust);
    customer = 'deleted' in c && c.deleted ? null : c;
  } else if (cust && !('deleted' in cust && cust.deleted)) {
    customer = cust;
  }
  return { subscription, customer };
}

async function runStripeSubscriptionAdminAction(subscriptionId, action, options) {
  const stripe = getStripe();
  if (action === 'cancel') {
    if (options?.cancelAtPeriodEnd === true) {
      return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    }
    return stripe.subscriptions.cancel(subscriptionId);
  }
  if (action === 'pause') {
    return stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'mark_uncollectible' },
    });
  }
  return stripe.subscriptions.update(subscriptionId, { pause_collection: null });
}

async function listProductsAndPricesForAdmin() {
  const stripe = getStripe();
  const products = await stripe.products.list({ limit: 100 });
  const catalog = [];
  for (const product of products.data) {
    const prices = await stripe.prices.list({ product: product.id, limit: 100, active: true });
    catalog.push({ product, prices: prices.data });
  }
  return { catalog };
}

async function createStripeProductAdmin(params) {
  const stripe = getStripe();
  const name = String(params.name ?? '').trim() || 'Unnamed plan';
  const description =
    params.description !== undefined && params.description !== null
      ? String(params.description)
      : undefined;
  const images = Array.isArray(params.images)
    ? params.images.filter((u) => typeof u === 'string' && u.trim()).slice(0, 8)
    : [];
  const rawMeta = params.metadata && typeof params.metadata === 'object' ? params.metadata : {};
  const metadata = {};
  for (const [k, v] of Object.entries(rawMeta)) {
    if (v == null) continue;
    const key = String(k).slice(0, 40);
    if (!key) continue;
    metadata[key] = String(v).slice(0, 500);
  }
  return stripe.products.create({
    name,
    description: description || undefined,
    images: images.length ? images : undefined,
    metadata: Object.keys(metadata).length ? metadata : undefined,
  });
}

async function updateStripeProductAdmin(productId, params) {
  const stripe = getStripe();
  return stripe.products.update(productId, params);
}

async function createStripePriceAdmin(params) {
  const stripe = getStripe();
  return stripe.prices.create({
    product: params.productId,
    unit_amount: params.unit_amount,
    currency: params.currency,
    recurring: { interval: params.interval },
  });
}

async function getStripeAdminBillingOverview() {
  const stripe = getStripe();
  const recentInvoices = await stripe.invoices.list({
    limit: 40,
    expand: ['data.customer', 'data.lines.data.price'],
  });
  await hydrateInvoiceLineProducts(stripe, recentInvoices.data);
  const failed = [];
  for await (const pi of stripe.paymentIntents.list({ limit: 50 })) {
    if (pi.last_payment_error || pi.status === 'requires_payment_method') {
      failed.push(pi);
    }
    if (failed.length >= 20) break;
  }
  return { recentInvoices: recentInvoices.data, failedPayments: failed };
}

async function getStripeInvoiceForAdmin(invoiceId) {
  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ['customer', 'payment_intent', 'lines.data.price.product', 'payments.data.payment'],
  });
  return { invoice };
}

async function sendStripeInvoiceReminderForAdmin(invoiceId) {
  const stripe = getStripe();
  const inv = await stripe.invoices.retrieve(invoiceId);
  const status = String(inv.status || '');
  if (status === 'paid' || status === 'void' || status === 'uncollectible') {
    throw Object.assign(new Error('Invoice cannot receive a payment reminder in this status.'), {
      statusCode: 400,
    });
  }
  await stripe.invoices.sendInvoice(invoiceId);
  return { success: true };
}

/**
 * Admin: map Stripe customer ids → current subscription product name (batch for user lists).
 * Uses the same “active / trialing / past_due / unpaid” pick as `user-billing` `get-subscription`.
 *
 * @param {import('node-appwrite').Models.Request} req
 * @param {unknown} body
 * @returns {Promise<{ labels: Record<string, string | null> }>}
 */
async function batchCustomerPlanLabelsForAdmin(req, body) {
  await assertAdmin(req);
  const raw = body && typeof body === 'object' ? body.customerIds : null;
  const arr = Array.isArray(raw) ? raw : [];
  const ids = [
    ...new Set(
      arr
        .map((x) => String(x ?? '').trim())
        .filter((id) => id.startsWith('cus_')),
    ),
  ].slice(0, 100);

  const stripe = getStripe();
  /** @type {Record<string, string | null>} */
  const labels = Object.create(null);

  const CHUNK = 10;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (customerId) => {
        try {
          const page = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 10,
            expand: ['data.items.data.price.product'],
          });
          await hydrateSubscriptionFirstItemProducts(stripe, page.data);
          const active =
            page.data.find((s) => s.status === 'active' || s.status === 'trialing') ||
            page.data.find((s) => s.status === 'past_due' || s.status === 'unpaid') ||
            null;
          if (!active) {
            labels[customerId] = null;
            return;
          }
          const item = active.items.data[0];
          const price = item?.price;
          const product =
            price?.product && typeof price.product === 'object' && !('deleted' in price.product)
              ? price.product
              : null;
          const name = product?.name != null ? String(product.name).trim() : '';
          labels[customerId] = name || null;
        } catch {
          labels[customerId] = null;
        }
      }),
    );
  }

  return { labels };
}

async function listAdminInvoicesRecent(limit) {
  const stripe = getStripe();
  const lim = Math.min(Math.max(limit, 1), 100);
  const list = await stripe.invoices.list({
    limit: lim,
    expand: ['data.customer', 'data.lines.data.price'],
  });
  await hydrateInvoiceLineProducts(stripe, list.data);
  return { invoices: list.data };
}

export default {
  listStripeSubscriptionsForCustomerAdmin,
  listStripeSubscriptionsForAdmin,
  getStripeSubscriptionForAdmin,
  runStripeSubscriptionAdminAction,
  listProductsAndPricesForAdmin,
  createStripeProductAdmin,
  updateStripeProductAdmin,
  createStripePriceAdmin,
  getStripeAdminBillingOverview,
  getStripeInvoiceForAdmin,
  sendStripeInvoiceReminderForAdmin,
  batchCustomerPlanLabelsForAdmin,
  listAdminInvoicesRecent,
};