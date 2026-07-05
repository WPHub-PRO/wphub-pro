/**
 * User-scoped billing — mirrors `src/api/stripe/userBilling.ts` (POST path `/user-billing`).
 * Uses `functions-lib` for Appwrite: endpoint (explicit, derived from `APPWRITE_FUNCTION_API_ENDPOINT`,
 * or WPHub default), project id, API key from env or `x-appwrite-key` on the request.
 */
import {requireAppwriteServerTriple, WPHUB_APPWRITE_IDS, listUserMemberships, userIsMemberOnlyOnTeam, Query, ID, Client, Databases, Users, Teams} from '@code045/wphubpro-shared'
import { platformTeamsTableId } from '@code045/wphubpro-shared';
import {
  hydrateInvoiceLineProducts,
  hydrateSubscriptionFirstItemProducts,
} from '../../../lib/hydrateSubscriptionProducts.ts';
import { getStripe } from '../../../lib/stripeClient.ts';
import { fetchPlatformAccountDoc } from '../../../lib/platformAccount.ts';
import { readTeamBillingJson } from '../../../lib/platformTeamBilling.ts';
import finalizeTeamCheckout from '../../../lib/finalizeTeamCheckout.ts';
import { resolveStripeBillingCustomer } from '../../../lib/billingEntity.ts';

const PREFS_KEY = 'stripe_customer_id';

/**
 * Invoice line total in cents, including line-level tax (`tax_amounts`).
 * @param {import('stripe').Stripe.InvoiceLineItem} line
 */
function invoiceLineTotalCents(line) {
  const base = Number(line.amount) || 0;
  const tax =
    Array.isArray(line.tax_amounts) && line.tax_amounts.length > 0
      ? line.tax_amounts.reduce((s, t) => s + (Number(t.amount) || 0), 0)
      : 0;
  return base + tax;
}

/**
 * Upcoming-invoice previews include the next cycle’s recurring charge; upgrade estimates should only
 * reflect prorations for the remainder of the current period (renewal invoices at period end).
 * @param {import('stripe').Stripe.Invoice} inv
 * @param {number} subscriptionCurrentPeriodEnd
 */
function upcomingInvoiceProrationLinesOnly(inv, subscriptionCurrentPeriodEnd) {
  const raw = inv.lines?.data ?? [];
  const prorationLines = raw.filter((line) => line.proration === true);
  if (prorationLines.length > 0) return prorationLines;
  const periodEnd = subscriptionCurrentPeriodEnd;
  return raw.filter((line) => {
    const ps = line.period?.start;
    if (ps != null && ps >= periodEnd) return false;
    return true;
  });
}

/**
 * Stripe Checkout replaces the literal `{CHECKOUT_SESSION_ID}` in `success_url`.
 * `URLSearchParams.set` encodes `{`/`}` → `%7B`/`%7D`, so the placeholder is never substituted.
 *
 * @param {string} returnUrl
 * @param {'success' | 'canceled'} variant
 */
function teamPlanCheckoutReturnUrl(returnUrl, variant) {
  const u = new URL(String(returnUrl).trim() || 'http://localhost:5173');
  const parts = [];
  new URLSearchParams(u.search).forEach((value, key) => {
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });
  parts.push(`team_checkout=${encodeURIComponent(variant === 'success' ? 'success' : 'canceled')}`);
  if (variant === 'success') {
    parts.push('session_id={CHECKOUT_SESSION_ID}');
  }
  return `${u.origin}${u.pathname}?${parts.join('&')}${u.hash || ''}`;
}

/** ISO 3166-1 alpha-2 members used for EU VAT (Stripe type `eu_vat`). */
const EU_VAT_PREFIXES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

/**
 * Stripe Customer `tax_id_data.type` from normalized VAT / tax ID (country = first two letters).
 * @param {string} normalizedNoSpaces uppercased ID without spaces
 * @returns {string | null}
 */
function inferStripeTaxIdTypeFromVatValue(normalizedNoSpaces) {
  const v = String(normalizedNoSpaces || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (v.length < 3) return null;
  const cc = v.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  if (cc === 'GB') return 'gb_vat';
  if (cc === 'XI') return 'eu_vat';
  if (EU_VAT_PREFIXES.has(cc)) return 'eu_vat';
  if (cc === 'NO') return 'no_vat';
  if (cc === 'CH') return 'ch_vat';
  if (cc === 'AU') return 'au_abn';
  if (cc === 'NZ') return 'nz_gst';
  return null;
}

/**
 * Billing details for the team Stripe customer (before Checkout).
 * @param {Record<string, unknown>} body
 */
function parseTeamCheckoutBillingDetails(body) {
  const billingCompanyName = String(body.billingCompanyName ?? body.billing_company_name ?? '').trim();
  const billing = body.billingAddress ?? body.billing_address;
  const addr = billing && typeof billing === 'object' ? billing : {};
  const line1 = String(addr.line1 ?? '').trim();
  const line2Raw = String(addr.line2 ?? '').trim();
  const city = String(addr.city ?? '').trim();
  const stateRaw = String(addr.state ?? '').trim();
  const postalCode = String(addr.postal_code ?? addr.postalCode ?? '').trim();
  const country = String(addr.country ?? '').trim().toUpperCase();
  const vatNumber = String(body.vatNumber ?? body.vat_number ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  return {
    billingCompanyName,
    line1,
    line2: line2Raw || undefined,
    city,
    state: stateRaw || undefined,
    postalCode,
    country,
    vatNumber: vatNumber || '',
  };
}

/**
 * @param {ReturnType<typeof parseTeamCheckoutBillingDetails>} b
 */
function assertTeamCheckoutBillingDetails(b) {
  if (!b.billingCompanyName || b.billingCompanyName.length > 256) {
    throw Object.assign(new Error('billingCompanyName is required (max 256 characters).'), { statusCode: 400 });
  }
  if (!b.line1 || b.line1.length > 500) {
    throw Object.assign(new Error('Billing address line1 is required.'), { statusCode: 400 });
  }
  if (!b.city || b.city.length > 100) {
    throw Object.assign(new Error('Billing city is required.'), { statusCode: 400 });
  }
  if (!b.postalCode || b.postalCode.length > 40) {
    throw Object.assign(new Error('Billing postal code is required.'), { statusCode: 400 });
  }
  if (!/^[A-Z]{2}$/.test(b.country)) {
    throw Object.assign(new Error('Billing country must be a 2-letter ISO code (e.g. NL, DE).'), { statusCode: 400 });
  }
  if (b.vatNumber) {
    const t = inferStripeTaxIdTypeFromVatValue(b.vatNumber);
    if (!t) {
      throw Object.assign(
        new Error(
          'VAT / tax ID is not supported or unrecognized. Use a standard ID starting with a supported country code (e.g. NL…, DE…, GB…).',
        ),
        { statusCode: 400 },
      );
    }
  }
}

/**
 * When the client passes `priceId`, ensure it is an active recurring team product price
 * matching the requested billing interval.
 *
 * @param {import('stripe').Stripe} stripe
 * @param {unknown} bodyPriceId
 * @param {'month' | 'year'} interval
 * @returns {Promise<string | null>} resolved price id, or null when bodyPriceId is empty (caller uses platform default)
 */
async function resolveTeamCheckoutBasePriceId(stripe, bodyPriceId, interval) {
  const expect = interval === 'year' ? 'year' : 'month';
  const raw = String(bodyPriceId ?? '').trim();
  if (!raw) return null;
  if (!raw.startsWith('price_')) {
    throw Object.assign(new Error('priceId must be a Stripe price id (price_…).'), { statusCode: 400 });
  }
  const price = await stripe.prices.retrieve(raw, { expand: ['product'] });
  if (!price.active) {
    throw Object.assign(new Error('That price is not active.'), { statusCode: 400 });
  }
  if (!price.recurring) {
    throw Object.assign(new Error('Team plan price must be a recurring subscription price.'), { statusCode: 400 });
  }
  if (price.recurring.interval !== expect) {
    throw Object.assign(
      new Error(`That price bills ${price.recurring.interval}ly; this checkout is ${expect}ly.`),
      { statusCode: 400 },
    );
  }
  const pref = price.product;
  const prod =
    typeof pref === 'string'
      ? await stripe.products.retrieve(pref)
      : pref && typeof pref === 'object' && !('deleted' in pref && pref.deleted)
        ? pref
        : null;
  if (!prod || prod.deleted) {
    throw Object.assign(new Error('Product not found for this price.'), { statusCode: 400 });
  }
  const meta = prod.metadata || {};
  const track = String(meta.wphub_track || '').trim().toLowerCase();
  const typeMeta = String(meta.type || '').trim().toLowerCase();
  if (track !== 'team' && !typeMeta.includes('team')) {
    throw Object.assign(
      new Error(
        'This product is not marked as a team plan. In Stripe, set product metadata wphub_track=team (recommended) or type containing "team".',
      ),
      { statusCode: 400 },
    );
  }
  return price.id;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v?.trim()) throw Object.assign(new Error(`${name} is required`), { statusCode: 500 });
  return v.trim();
}

/** Set for the duration of {@link runUserBillingAction} so Appwrite can use `x-appwrite-key`. */
let _stripeAppwriteReq: unknown;

function setStripeAppwriteReq(req: unknown) { _stripeAppwriteReq = req; }

function appwriteClient() {
  const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(_stripeAppwriteReq);
  return new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
}

function appwriteUsers() {
  return new Users(appwriteClient());
}

function appwriteDatabases() {
  return new Databases(appwriteClient());
}

function appwriteTeams() {
  return new Teams(appwriteClient());
}

/**
 * Keep `platform_db.accounts.stripe_customer_id` aligned with prefs (and create row if missing).
 */
async function syncAccountsStripeCustomerId(userId, stripeCustomerId) {
  if (!userId || !stripeCustomerId || !String(stripeCustomerId).startsWith('cus_')) return;
  try {
    const databases = appwriteDatabases();
    const dbId =
      process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
    const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;
    const found = await databases.listDocuments(dbId, accountsColl, [
      Query.equal('user_id', userId),
      Query.limit(1),
    ]);
    const doc = found.documents?.[0];
    if (!doc) {
      await databases.createDocument(dbId, accountsColl, ID.unique(), {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
      });
      return;
    }
    if (doc.stripe_customer_id === stripeCustomerId) return;
    await databases.updateDocument(dbId, accountsColl, doc.$id, {
      stripe_customer_id: stripeCustomerId,
    });
  } catch (e) {
    console.error('[syncAccountsStripeCustomerId]', e && e.message ? e.message : e);
  }
}

async function getStripeCustomerId(userId) {
  const users = appwriteUsers();
  const u = await users.get(userId);
  const raw = u.prefs?.[PREFS_KEY];
  return typeof raw === 'string' && raw.startsWith('cus_') ? raw : null;
}

async function requireCustomer(userId) {
  const id = await getStripeCustomerId(userId);
  if (!id) throw Object.assign(new Error('No Stripe customer for this account'), { statusCode: 400, code: 'NO_CUSTOMER' });
  return id;
}

/**
 * After `teams.owner_id` changes: set Stripe team customer email to the new owner's Appwrite email.
 *
 * @param {import('stripe').Stripe} stripe
 * @param {import('node-appwrite').Databases} databases
 * @param {string} teamId
 */
async function syncStripeTeamCustomerEmail(stripe, databases, teamId) {
  const tid = String(teamId || '').trim();
  if (!tid) {
    return { success: false, skipped: true, reason: 'missing_team_id' };
  }
  const tColl = platformTeamsTableId();
  const db =
    String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  let row;
  try {
    row = await databases.getDocument(db, tColl, tid);
  } catch {
    return { success: false, skipped: true, reason: 'team_row_missing' };
  }
  const customerId = String(row.stripe_customer_id || '').trim();
  if (!customerId.startsWith('cus_')) {
    return { success: true, skipped: true, reason: 'no_stripe_customer' };
  }
  const ownerId = String(row.owner_id || '').trim();
  if (!ownerId) {
    return { success: true, skipped: true, reason: 'no_owner' };
  }
  const users = appwriteUsers();
  let u;
  try {
    u = await users.get(ownerId);
  } catch {
    return { success: false, skipped: true, reason: 'owner_user_missing' };
  }
  const email = typeof u.email === 'string' ? u.email.trim() : '';
  if (!email) {
    return { success: true, skipped: true, reason: 'no_owner_email' };
  }
  await stripe.customers.update(customerId, { email });
  return { success: true, stripeCustomerId: customerId, email };
}

function mapInvoice(inv) {
  return {
    id: inv.id,
    created: inv.created,
    amount_paid: inv.amount_paid,
    amount_due: inv.amount_due ?? undefined,
    amount_remaining: inv.amount_remaining ?? undefined,
    currency: inv.currency,
    status: inv.status ?? '',
    invoice_pdf: inv.invoice_pdf ?? '',
    hosted_invoice_url: inv.hosted_invoice_url ?? undefined,
    number: inv.number ?? undefined,
    period_start: inv.period_start ?? undefined,
    period_end: inv.period_end ?? undefined,
  };
}

async function listInvoicesForCustomer(customerId, options) {
  const stripe = getStripe();
  const limit = options?.limit ?? 50;
  const list = await stripe.invoices.list({
    customer: customerId,
    limit,
    expand: ['data.payment_intent', 'data.charge', 'data.lines.data.price', 'data.customer'],
  });
  await hydrateInvoiceLineProducts(stripe, list.data);
  return list;
}

async function listSubscriptionsForCustomer(customerId) {
  const stripe = getStripe();
  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
    expand: ['data.default_payment_method', 'data.items.data.price', 'data.latest_invoice'],
  });
  await hydrateSubscriptionFirstItemProducts(stripe, list.data);
  return list;
}

async function retrieveStripeSubscription(subscriptionId) {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: [
      'latest_invoice',
      'latest_invoice.payment_intent',
      'items.data.price.product',
      'default_payment_method',
      'customer',
    ],
  });
}

function pmCard(pm) {
  if (pm.type !== 'card' || !pm.card) return null;
  return {
    brand: pm.card.brand,
    last4: pm.card.last4,
    exp_month: pm.card.exp_month,
    exp_year: pm.card.exp_year,
  };
}

/** @param {import('stripe').Stripe.Subscription} sub */
function subscriptionCustomerIdFromSub(sub) {
  const c = sub.customer;
  return typeof c === 'string' ? c : c?.id ?? null;
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {string} customerId
 * @returns {Promise<Array<{ id: string; type: string; value: string; country: string | null; livemode: boolean; verification: { status: string; verified_address?: string | null } | null }>>}
 */
async function listCustomerTaxIdsMapped(stripe, customerId) {
  const list = await stripe.customers.listTaxIds(customerId, { limit: 30 });
  return list.data.map((t) => ({
    id: t.id,
    type: t.type,
    value: t.value,
    country: t.country ?? null,
    livemode: t.livemode,
    verification: t.verification
      ? {
          status: t.verification.status,
          verified_address: t.verification.verified_address ?? null,
        }
      : null,
  }));
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {string} subscriptionId
 * @param {string} expectedCustomerId
 */
async function assertSubscriptionBelongsToCustomer(stripe, subscriptionId, expectedCustomerId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['customer'] });
  const custId = subscriptionCustomerIdFromSub(sub);
  if (!custId || custId !== expectedCustomerId) {
    throw Object.assign(new Error('Subscription does not belong to this billing context'), { statusCode: 403 });
  }
  return sub;
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {string} subscriptionId
 * @param {string} [expectedCustomerId] When set (user or team Stripe customer), rejects cross-customer access.
 */
async function buildSubscriptionDetailsResponse(stripe, subscriptionId, expectedCustomerId) {
  const sub = await retrieveStripeSubscription(subscriptionId);
  const custId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!custId) throw Object.assign(new Error('Subscription has no customer'), { statusCode: 400 });
  if (expectedCustomerId && custId !== expectedCustomerId) {
    throw Object.assign(new Error('Subscription does not belong to this billing context'), { statusCode: 403 });
  }

  const customer = await stripe.customers.retrieve(custId, {
    expand: ['invoice_settings.default_payment_method'],
  });
  if (customer.deleted) throw Object.assign(new Error('Customer was deleted'), { statusCode: 400 });

  const item = sub.items.data[0];
  const price = item?.price;
  const product =
    price?.product && typeof price.product === 'object' && !('deleted' in price.product)
      ? price.product
      : null;
  const meta = product?.metadata ?? {};
  const sitesLimit = Number(meta.sites_limit ?? meta.sitesLimit ?? 0) || 0;
  const libraryLimit = Number(meta.library_limit ?? meta.libraryLimit ?? 0) || 0;
  const storageLimit = Number(meta.storage_limit ?? meta.storageLimit ?? 0) || 0;

  const plan = {
    product_id: product?.id ?? null,
    product_name: product?.name ?? null,
    product_description: product?.description ?? null,
    price_id: price?.id ?? null,
    unit_amount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    interval: price?.recurring?.interval ?? null,
    interval_count: price?.recurring?.interval_count ?? null,
    metadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])),
    limits: {
      sites_limit: sitesLimit || null,
      library_limit: libraryLimit || null,
      storage_limit: storageLimit || null,
    },
  };

  const addr = customer.address;
  const address = addr
    ? {
        line1: addr.line1,
        line2: addr.line2,
        city: addr.city,
        state: addr.state,
        postal_code: addr.postal_code,
        country: addr.country,
      }
    : null;

  const dpm = customer.invoice_settings?.default_payment_method;
  let payment_method = null;
  if (dpm && typeof dpm === 'object' && 'type' in dpm) {
    const pm = dpm;
    payment_method = {
      id: pm.id,
      type: pm.type,
      card: pmCard(pm),
    };
  }

  const invList = await stripe.invoices.list({ subscription: sub.id, limit: 12 });
  const invoices = invList.data.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status ?? '',
    amount_due: inv.amount_due,
    amount_paid: inv.amount_paid,
    amount_remaining: inv.amount_remaining,
    currency: inv.currency,
    created: inv.created,
    due_date: inv.due_date,
    period_start: inv.period_start,
    period_end: inv.period_end,
    invoice_pdf: inv.invoice_pdf,
    hosted_invoice_url: inv.hosted_invoice_url,
    paid: inv.status === 'paid',
  }));

  let upcoming_invoice = null;
  try {
    const up = await stripe.invoices.retrieveUpcoming({ subscription: sub.id });
    upcoming_invoice = {
      amount_due: up.amount_due,
      currency: up.currency,
      period_start: up.period_start,
      period_end: up.period_end,
      next_payment_attempt: up.next_payment_attempt,
    };
  } catch {
    upcoming_invoice = null;
  }

  let tax_ids = [];
  try {
    tax_ids = await listCustomerTaxIdsMapped(stripe, custId);
  } catch (e) {
    console.warn('[buildSubscriptionDetailsResponse] tax_ids', e && e.message ? e.message : e);
  }

  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      created: sub.created,
      start_date: sub.start_date,
      cancel_at: sub.cancel_at,
      canceled_at: sub.canceled_at,
      ended_at: sub.ended_at ?? undefined,
      trial_start: sub.trial_start,
      trial_end: sub.trial_end,
      metadata: Object.fromEntries(Object.entries(sub.metadata ?? {}).map(([k, v]) => [k, String(v)])),
      collection_method: sub.collection_method ?? undefined,
      days_until_due: sub.days_until_due,
      pause_collection: sub.pause_collection,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone,
      address,
      created: customer.created,
      balance: customer.balance,
      currency: customer.currency,
      tax_ids,
    },
    plan,
    pending_update: null,
    invoices,
    upcoming_invoice,
    payment_method,
  };
}

async function createStripeCustomerAndSavePrefs({ userId, email, name }) {
  const stripe = getStripe();
  const users = appwriteUsers();
  const prefs = (await users.get(userId)).prefs ?? {};
  const existingId = prefs[PREFS_KEY];
  if (typeof existingId === 'string' && existingId.startsWith('cus_')) {
    const customer = await stripe.customers.retrieve(existingId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (!('deleted' in customer && customer.deleted)) {
      await syncAccountsStripeCustomerId(userId, customer.id);
      return { stripeCustomerId: customer.id, customer };
    }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { appwrite_user_id: userId },
    expand: ['invoice_settings.default_payment_method'],
  });

  await users.updatePrefs({
    userId,
    prefs: {
      ...prefs,
      [PREFS_KEY]: customer.id,
    },
  });

  await syncAccountsStripeCustomerId(userId, customer.id);

  return { stripeCustomerId: customer.id, customer };
}

/**
 * @param {object} req Appwrite function request (supplies `x-appwrite-key` for Appwrite client when env keys are unset)
 * @param {string} userId
 * @param {Record<string, unknown>} body
 */

export {
  PREFS_KEY,
  invoiceLineTotalCents,
  upcomingInvoiceProrationLinesOnly,
  teamPlanCheckoutReturnUrl,
  inferStripeTaxIdTypeFromVatValue,
  parseTeamCheckoutBillingDetails,
  assertTeamCheckoutBillingDetails,
  resolveTeamCheckoutBasePriceId,
  setStripeAppwriteReq,
  appwriteUsers,
  appwriteDatabases,
  appwriteTeams,
  syncAccountsStripeCustomerId,
  getStripeCustomerId,
  requireCustomer,
  syncStripeTeamCustomerEmail,
  mapInvoice,
  listInvoicesForCustomer,
  listSubscriptionsForCustomer,
  retrieveStripeSubscription,
  pmCard,
  subscriptionCustomerIdFromSub,
  listCustomerTaxIdsMapped,
  assertSubscriptionBelongsToCustomer,
  buildSubscriptionDetailsResponse,
  createStripeCustomerAndSavePrefs,
};
