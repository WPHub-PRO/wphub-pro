/**
 * User-scoped billing — mirrors `src/api/stripe/userBilling.ts` (POST path `/user-billing`).
 * Uses `functions-lib` for Appwrite: endpoint (explicit, derived from `APPWRITE_FUNCTION_API_ENDPOINT`,
 * or WPHub default), project id, API key from env or `x-appwrite-key` on the request.
 */
import {requireAppwriteServerTriple, WPHUB_APPWRITE_IDS, listUserMemberships, userIsMemberOnlyOnTeam, Query, ID, Client, Databases, Users, Teams} from '@code045/wphubpro-shared'
import platformTeamsTableId from '../lib/platformTeamsTableId.ts';
import {
  hydrateInvoiceLineProducts,
  hydrateSubscriptionFirstItemProducts,
} from '../lib/hydrateSubscriptionProducts.ts';
import { getStripe } from '../lib/stripeClient.ts';
import { listPlansForAdmin } from './plansExt.ts';
import { fetchPlatformAccountDoc } from '../lib/platformAccount.ts';
import { readTeamBillingJson } from '../lib/platformTeamBilling.ts';
import finalizeTeamCheckout from '../lib/finalizeTeamCheckout.ts';
import { resolveStripeBillingCustomer } from '../lib/billingEntity.ts';

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
let _stripeAppwriteReq;

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
async function runUserBillingAction(req, userId, body) {
  _stripeAppwriteReq = req;
  try {
    const action = String(body.action ?? '').trim().toLowerCase();
    const stripe = getStripe();
    const databases = appwriteDatabases();
    const billingCustomerId = async () => {
      const { customerId } = await resolveStripeBillingCustomer({
        databases,
        req,
        userId,
        body: body && typeof body === 'object' ? body : {},
        users: appwriteUsers(),
      });
      return customerId;
    };
    const accDoc = await fetchPlatformAccountDoc(databases, userId);
    const usersApi = appwriteUsers();
    const mems = await listUserMemberships(usersApi, userId);
    const active = String(accDoc?.active_team_id || '').trim();
    const memberOnlyWorkspace = active && userIsMemberOnlyOnTeam(mems, active, userId);
    const entityTypeForGate = String(body?.entityType ?? 'user')
      .trim()
      .toLowerCase();
    /** Team-member workspace: still allow read-only personal (`entityType: user`) billing views on profile. */
    const teamMemberPersonalReadonly =
      memberOnlyWorkspace &&
      entityTypeForGate === 'user' &&
      new Set([
        'get-subscription',
        'get-subscription-details',
        'get-customer',
        'list-invoices',
        'list-payment-methods',
        'list-tax-ids',
      ]).has(action);
    if (memberOnlyWorkspace && action !== 'list-plans' && !teamMemberPersonalReadonly) {
      if (action === 'ensure-customer') {
        return { success: true, skipped: true, reason: 'team_member' };
      }
      throw Object.assign(new Error('Billing is managed by your team owner.'), {
        statusCode: 403,
        code: 'TEAM_MEMBER',
      });
    }

    switch (action) {
    case 'list-invoices': {
      const customerId = await billingCustomerId();
      const list = await listInvoicesForCustomer(customerId, { limit: 50 });
      return { invoices: list.data.map(mapInvoice) };
    }

    case 'list-plans': {
      const excludeHidden = body.exclude_hidden !== false;
      const excludeNonSellable = body.exclude_non_sellable !== false;
      const { plans } = await listPlansForAdmin({
        activeOnly: true,
        excludeHidden,
        excludeNonSellable,
        includeCounts: false,
      });
      return { plans };
    }

    case 'create-checkout-session': {
      const customerId = await billingCustomerId();
      const priceId = String(body.priceId ?? '').trim();
      const returnUrl = String(body.returnUrl ?? '').trim() || 'http://localhost:5173';
      const updateType = body.updateType;
      const paymentMethodId = typeof body.paymentMethodId === 'string' ? body.paymentMethodId.trim() : '';

      if (!priceId) throw Object.assign(new Error('priceId is required'), { statusCode: 400 });

      const subs = await listSubscriptionsForCustomer(customerId);
      const active = subs.data.find((s) => s.status === 'active' || s.status === 'trialing');

      if (!active) {
        const success = new URL(returnUrl);
        success.searchParams.set('success', 'true');
        const canceled = new URL(returnUrl);
        canceled.searchParams.set('canceled', 'true');
        const extraLineItems = Array.isArray(body.extraLineItems) ? body.extraLineItems : [];
        const extras = extraLineItems
          .filter((x) => x && typeof x.priceId === 'string' && x.priceId.trim())
          .map((x) => ({
            price: String(x.priceId).trim(),
            quantity: Math.max(1, Math.min(999, Number(x.quantity) || 1)),
          }));
        const line_items = [{ price: priceId, quantity: 1 }, ...extras];
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          line_items,
          success_url: success.toString(),
          cancel_url: canceled.toString(),
          allow_promotion_codes: true,
        });
        return {
          sessionId: session.id,
          url: session.url,
          subscriptionId: session.subscription,
          status: session.status,
        };
      }

      const itemId = active.items.data[0]?.id;
      if (!itemId) throw Object.assign(new Error('Subscription has no items'), { statusCode: 400 });

      const updated = await stripe.subscriptions.update(active.id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: updateType === 'downgrade' ? 'none' : 'create_prorations',
        default_payment_method: paymentMethodId || undefined,
        expand: ['latest_invoice.payment_intent', 'latest_invoice'],
      });

      const inv = updated.latest_invoice;
      const invObj = typeof inv === 'object' && inv && !('deleted' in inv) ? inv : null;
      const pi = invObj?.payment_intent;
      const piObj = typeof pi === 'object' && pi && 'client_secret' in pi ? pi : null;

      if (piObj?.client_secret && invObj && invObj.amount_due > 0) {
        return {
          subscriptionId: updated.id,
          status: updated.status,
          payment: {
            clientSecret: piObj.client_secret,
            invoiceId: invObj.id,
            amountDue: invObj.amount_due,
            currency: invObj.currency,
            status: piObj.status ?? '',
          },
        };
      }

      return {
        subscriptionId: updated.id,
        status: updated.status,
        message: 'Plan updated.',
      };
    }

    case 'cancel-subscription': {
      const customerId = await billingCustomerId();
      const subs = await listSubscriptionsForCustomer(customerId);
      const active = subs.data.find((s) => s.status === 'active' || s.status === 'trialing');
      if (!active) throw Object.assign(new Error('No active subscription'), { statusCode: 400 });
      const updated = await stripe.subscriptions.update(active.id, { cancel_at_period_end: true });
      return {
        success: true,
        cancelAt: updated.cancel_at ?? updated.current_period_end,
        message: 'Your subscription will cancel at the end of the billing period.',
      };
    }

    case 'get-subscription': {
      const billingCtx = await resolveStripeBillingCustomer({
        databases,
        req,
        userId,
        body: body && typeof body === 'object' ? body : {},
        users: appwriteUsers(),
      });
      const customerId = billingCtx.customerId;
      const subs = await listSubscriptionsForCustomer(customerId);
      let active =
        subs.data.find((s) => s.status === 'active' || s.status === 'trialing') ||
        subs.data.find((s) => s.status === 'past_due' || s.status === 'unpaid') ||
        null;

      if (!active && billingCtx.entityType === 'team' && billingCtx.teamId) {
        try {
          const tColl = platformTeamsTableId();
          const db =
            String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
          const row = await databases.getDocument(db, tColl, billingCtx.teamId);
          const pinned = String(row.stripe_subscription_id ?? '').trim();
          if (pinned.startsWith('sub_')) {
            const sub = await retrieveStripeSubscription(pinned);
            const custId = subscriptionCustomerIdFromSub(sub);
            const okStatus =
              sub &&
              ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status) &&
              custId === customerId;
            if (okStatus) active = sub;
          }
        } catch {
          /* ignore */
        }
      }

      if (!active) return { status: 'canceled' };
      const item = active.items.data[0];
      const price = item?.price;
      const product =
        price?.product && typeof price.product === 'object' && !('deleted' in price.product) ? price.product : null;
      const meta = product?.metadata ?? {};
      const sitesLimit = Number(meta.sites_limit ?? meta.sitesLimit ?? 0) || 0;
      const libraryLimit = Number(meta.library_limit ?? meta.libraryLimit ?? 0) || 0;
      const storageLimit = Number(meta.storage_limit ?? meta.storageLimit ?? 0) || 0;
      const interval = price?.recurring?.interval === 'year' ? 'year' : 'month';
      return {
        userId,
        stripeSubscriptionId: active.id,
        stripe_subscription_id: active.id,
        planId: product?.id ?? (typeof price?.product === 'string' ? price.product : ''),
        status:
          active.status === 'active'
            ? 'active'
            : active.status === 'trialing'
              ? 'trialing'
              : 'past_due',
        sitesLimit,
        storageLimit,
        libraryLimit,
        source: 'stripe',
        currentPeriodEnd: active.current_period_end,
        cancelAtPeriodEnd: active.cancel_at_period_end,
        priceId: price?.id,
        priceAmount: price?.unit_amount ?? undefined,
        currency: price?.currency,
        interval,
        intervalCount: price?.recurring?.interval_count,
      };
    }

    case 'get-customer': {
      const customerId = await billingCustomerId();
      const c = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      if (c.deleted) throw Object.assign(new Error('Customer deleted'), { statusCode: 400 });
      const addr = c.address;
      let taxIds = [];
      try {
        taxIds = await listCustomerTaxIdsMapped(stripe, customerId);
      } catch (e) {
        console.warn('[get-customer] tax_ids', e && e.message ? e.message : e);
      }
      return {
        success: true,
        customer: {
          id: c.id,
          email: c.email,
          name: c.name,
          phone: c.phone,
          address: addr
            ? {
                line1: addr.line1,
                line2: addr.line2,
                city: addr.city,
                state: addr.state,
                postal_code: addr.postal_code,
                country: addr.country,
              }
            : null,
          tax_ids: taxIds,
        },
      };
    }

    case 'list-payment-methods': {
      const customerId = await billingCustomerId();
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      if (customer.deleted) throw Object.assign(new Error('Customer deleted'), { statusCode: 400 });
      const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
      let defaultPaymentMethodId = null;
      const dpm = customer.invoice_settings?.default_payment_method;
      if (typeof dpm === 'string') defaultPaymentMethodId = dpm;
      else if (dpm && typeof dpm === 'object' && 'id' in dpm) defaultPaymentMethodId = dpm.id;

      const paymentMethods = list.data.map((pm) => ({
        id: pm.id,
        type: pm.type,
        card: pmCard(pm),
      }));
      return { paymentMethods, defaultPaymentMethodId };
    }

    case 'create-setup-intent': {
      const customerId = await billingCustomerId();
      const si = await stripe.setupIntents.create({ customer: customerId, usage: 'off_session' });
      if (!si.client_secret) throw Object.assign(new Error('SetupIntent missing client_secret'), { statusCode: 500 });
      return { clientSecret: si.client_secret };
    }

    case 'attach-payment-method': {
      const customerId = await billingCustomerId();
      const paymentMethodId = String(body.paymentMethodId ?? '').trim();
      const setAsDefault = body.setAsDefault !== false;
      if (!paymentMethodId) throw Object.assign(new Error('paymentMethodId is required'), { statusCode: 400 });
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      if (setAsDefault) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }
      return { success: true };
    }

    case 'detach-payment-method': {
      const customerId = await billingCustomerId();
      const paymentMethodId = String(body.paymentMethodId ?? '').trim();
      if (!paymentMethodId) throw Object.assign(new Error('paymentMethodId is required'), { statusCode: 400 });
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (String(pm.customer || '') !== customerId) {
        throw Object.assign(new Error('Payment method does not belong to this billing context'), {
          statusCode: 403,
        });
      }
      await stripe.paymentMethods.detach(paymentMethodId);
      return { success: true };
    }

    case 'set-default-payment-method': {
      const customerId = await billingCustomerId();
      const paymentMethodId = String(body.paymentMethodId ?? '').trim();
      if (!paymentMethodId) throw Object.assign(new Error('paymentMethodId is required'), { statusCode: 400 });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      return { success: true };
    }

    case 'get-subscription-details': {
      const customerId = await billingCustomerId();
      const subscriptionId = String(body.subscriptionId ?? '').trim();
      if (!subscriptionId) throw Object.assign(new Error('subscriptionId is required'), { statusCode: 400 });
      return buildSubscriptionDetailsResponse(stripe, subscriptionId, customerId);
    }

    case 'preview-proration': {
      const customerId = await billingCustomerId();
      const subscriptionId = String(body.subscriptionId ?? '').trim();
      const newPriceId = String(body.newPriceId ?? '').trim();
      if (!subscriptionId || !newPriceId) {
        throw Object.assign(new Error('subscriptionId and newPriceId are required'), { statusCode: 400 });
      }
      await assertSubscriptionBelongsToCustomer(stripe, subscriptionId, customerId);
      const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
      const item = sub.items.data[0];
      if (!item?.id) throw Object.assign(new Error('Subscription has no line items'), { statusCode: 400 });
      const inv = await stripe.invoices.retrieveUpcoming({
        customer: customerId,
        subscription: subscriptionId,
        subscription_items: [{ id: item.id, price: newPriceId }],
      });
      const periodEnd = sub.current_period_end;
      const useLines = upcomingInvoiceProrationLinesOnly(inv, periodEnd);
      const lines = useLines.map((line) => ({
          description: line.description ?? '',
          amount: invoiceLineTotalCents(line),
          period: {
            start: line.period?.start ?? inv.period_start,
            end: line.period?.end ?? inv.period_end,
          },
        }));
      const amountDue = useLines.reduce((sum, line) => sum + invoiceLineTotalCents(line), 0);
      return {
        amountDue,
        currency: inv.currency,
        nextPaymentDate: null,
        lines,
      };
    }

    case 'prepare-pay-invoice': {
      const customerId = await billingCustomerId();
      const invoiceId = String(body.invoiceId ?? '').trim();
      if (!invoiceId) throw Object.assign(new Error('invoiceId is required'), { statusCode: 400 });
      const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] });
      const invCust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      if (invCust !== customerId) {
        throw Object.assign(new Error('Invoice does not belong to this customer'), { statusCode: 403 });
      }
      if (inv.status === 'paid') {
        return { success: true, paid: true };
      }
      let current = inv;
      if (current.status === 'draft') {
        current = await stripe.invoices.finalizeInvoice(current.id, { expand: ['payment_intent'] });
      }
      const pi = current.payment_intent;
      const piObj = typeof pi === 'object' && pi && 'client_secret' in pi ? pi : null;
      return {
        success: true,
        paid: false,
        clientSecret: piObj?.client_secret,
        invoiceId: current.id,
        amountDue: current.amount_due,
        currency: current.currency,
        paymentIntentStatus: piObj?.status,
      };
    }

    case 'update-customer': {
      const customerId = await billingCustomerId();
      const name = typeof body.name === 'string' ? body.name : undefined;
      const email = typeof body.email === 'string' ? body.email : undefined;
      const phone = typeof body.phone === 'string' ? body.phone : undefined;
      const address = body.address;
      await stripe.customers.update(customerId, {
        name: name ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
        address:
          address && typeof address === 'object'
            ? {
                line1: address.line1 ?? undefined,
                line2: address.line2 ?? undefined,
                city: address.city ?? undefined,
                state: address.state ?? undefined,
                postal_code: address.postal_code ?? undefined,
                country: address.country ?? undefined,
              }
            : undefined,
      });
      return { success: true };
    }

    /** Add a tax ID (VAT etc.) on the resolved billing customer — platform UX, not Billing Portal. */
    case 'add-customer-tax-id':
    case 'add-tax-id': {
      const customerId = await billingCustomerId();
      const type = String(body.type ?? body.taxType ?? '').trim();
      const value = String(body.value ?? '').trim();
      if (!type || !value) {
        throw Object.assign(new Error('type and value are required (Stripe tax id type, e.g. eu_vat)'), {
          statusCode: 400,
        });
      }
      const created = await stripe.customers.createTaxId(customerId, { type, value });
      return {
        success: true,
        taxId: {
          id: created.id,
          type: created.type,
          value: created.value,
          country: created.country ?? null,
          verification: created.verification
            ? {
                status: created.verification.status,
                verified_address: created.verification.verified_address ?? null,
              }
            : null,
        },
      };
    }

    case 'delete-customer-tax-id':
    case 'delete-tax-id': {
      const customerId = await billingCustomerId();
      const taxId = String(body.taxId ?? body.tax_id ?? '').trim();
      if (!taxId) {
        throw Object.assign(new Error('taxId is required'), { statusCode: 400 });
      }
      await stripe.customers.deleteTaxId(customerId, taxId);
      return { success: true };
    }

    case 'list-customer-tax-ids':
    case 'list-tax-ids': {
      const customerId = await billingCustomerId();
      const taxIds = await listCustomerTaxIdsMapped(stripe, customerId);
      return { success: true, taxIds };
    }

    case 'ensure-customer': {
      const users = appwriteUsers();
      const u = await users.get(userId);
      const existing = await getStripeCustomerId(userId);
      if (existing) {
        await syncAccountsStripeCustomerId(userId, existing);
        return { success: true, skipped: true, stripeCustomerId: existing, message: 'Customer already exists.' };
      }
      const { stripeCustomerId } = await createStripeCustomerAndSavePrefs({
        userId,
        email: u.email,
        name: u.name,
      });
      return { success: true, stripeCustomerId, message: 'Stripe customer created.' };
    }

    case 'cancel-scheduled-change':
    case 'cancel-schedule-update': {
      const customerId = await billingCustomerId();
      let scheduleId = typeof body.scheduleId === 'string' ? body.scheduleId.trim() : '';
      const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
      if (!scheduleId && subscriptionId) {
        await assertSubscriptionBelongsToCustomer(stripe, subscriptionId, customerId);
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        if (typeof sub.schedule === 'string') scheduleId = sub.schedule;
      }
      if (!scheduleId) {
        throw Object.assign(new Error('scheduleId or subscriptionId with an active schedule is required'), {
          statusCode: 400,
        });
      }
      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, { expand: ['customer'] });
      const schCust =
        typeof schedule.customer === 'string'
          ? schedule.customer
          : schedule.customer && typeof schedule.customer === 'object' && 'id' in schedule.customer
            ? schedule.customer.id
            : null;
      if (schCust && schCust !== customerId) {
        throw Object.assign(new Error('Schedule does not belong to this billing context'), { statusCode: 403 });
      }
      const subRef = schedule.subscription;
      const sid = typeof subRef === 'string' ? subRef : subRef && 'id' in subRef ? subRef.id : null;
      if (sid) {
        await assertSubscriptionBelongsToCustomer(stripe, sid, customerId);
      }
      await stripe.subscriptionSchedules.cancel(scheduleId);
      return { success: true, scheduleId };
    }

    /** Optional escape hatch; primary billing UX should use in-app customer/subscription/invoice/tax-id actions. */
    case 'billing-portal': {
      const customerId = await billingCustomerId();
      const returnUrl = String(body.returnUrl ?? '').trim() || 'http://localhost:5173';
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return { url: session.url };
    }

    case 'create-team-checkout-session': {
      const teamName = String(body.teamName ?? body.team_name ?? '').trim();
      if (!teamName || teamName.length > 128) {
        throw Object.assign(new Error('teamName is required (max 128 chars)'), { statusCode: 400 });
      }
      const billingDetails = parseTeamCheckoutBillingDetails(body);
      assertTeamCheckoutBillingDetails(billingDetails);
      const returnUrl = String(body.returnUrl ?? '').trim() || 'http://localhost:5173';
      const interval = String(body.interval ?? 'month').toLowerCase() === 'year' ? 'year' : 'month';
      const billing = await readTeamBillingJson(req);
      const stripe = getStripe();
      let priceId = await resolveTeamCheckoutBasePriceId(stripe, body.priceId ?? body.price_id, interval);
      if (!priceId) {
        priceId =
          interval === 'year'
            ? String(billing?.teamYearlyPriceId ?? '').trim()
            : String(billing?.teamMonthlyPriceId ?? '').trim();
      }
      if (!priceId) {
        throw Object.assign(new Error('Team plan price is not configured (pick a plan or set admin Finance → Plans).'), {
          statusCode: 503,
        });
      }

      const priceDoc = await stripe.prices.retrieve(priceId, { expand: ['product'] });
      const pref = priceDoc.product;
      const prod =
        typeof pref === 'string'
          ? await stripe.products.retrieve(pref)
          : pref && typeof pref === 'object' && !('deleted' in pref && pref.deleted)
            ? pref
            : null;
      if (!prod || prod.deleted) {
        throw Object.assign(new Error('Could not load Stripe product for this team price.'), { statusCode: 400 });
      }
      const rawSeats = prod.metadata && String(prod.metadata.seats_included ?? '').trim();
      const parsed = Number(rawSeats);
      if (!rawSeats || !Number.isFinite(parsed) || parsed < 1) {
        throw Object.assign(
          new Error('Team product must define Stripe metadata seats_included (positive integer).'),
          { statusCode: 400 },
        );
      }
      const initialSeats = Math.max(1, Math.min(999, Math.floor(parsed)));

      const users = appwriteUsers();
      const u = await users.get(userId);
      const taxType =
        billingDetails.vatNumber && billingDetails.vatNumber.length >= 3
          ? inferStripeTaxIdTypeFromVatValue(billingDetails.vatNumber)
          : null;
      /** @type {import('stripe').Stripe.CustomerCreateParams} */
      const customerCreate = {
        name: billingDetails.billingCompanyName,
        email: u.email || undefined,
        address: {
          line1: billingDetails.line1,
          line2: billingDetails.line2,
          city: billingDetails.city,
          state: billingDetails.state,
          postal_code: billingDetails.postalCode,
          country: billingDetails.country,
        },
        metadata: {
          wphub_team: '1',
          appwrite_owner_id: userId,
          team_workspace_name: teamName.slice(0, 500),
        },
      };
      if (billingDetails.vatNumber && taxType) {
        customerCreate.tax_id_data = [{ type: taxType, value: billingDetails.vatNumber }];
      }
      let customer;
      try {
        customer = await stripe.customers.create(customerCreate);
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Stripe customer creation failed';
        throw Object.assign(new Error(msg), { statusCode: 400 });
      }
      const successUrl = teamPlanCheckoutReturnUrl(returnUrl, 'success');
      const cancelUrl = teamPlanCheckoutReturnUrl(returnUrl, 'canceled');
      const lineItems = [{ price: priceId, quantity: 1 }];
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.id,
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          wphub_checkout: 'team_plan',
          appwrite_owner_id: userId,
          team_name: teamName,
          initial_seats: String(initialSeats),
        },
        subscription_data: {
          metadata: {
            wphub_checkout: 'team_plan',
            appwrite_owner_id: userId,
            team_name: teamName,
            initial_seats: String(initialSeats),
          },
        },
      });
      return { sessionId: session.id, url: session.url };
    }

    case 'finalize-team-checkout': {
      const sessionId = String(body.sessionId ?? body.session_id ?? '').trim();
      const databases = appwriteDatabases();
      const teams = appwriteTeams();
      const stripe = getStripe();
      const out = await finalizeTeamCheckout({
        stripe,
        databases,
        teams,
        userId,
        sessionId,
      });
      return out;
    }

    case 'list-team-invoices': {
      const customerId = String(body.stripeCustomerId ?? body.stripe_customer_id ?? '').trim();
      if (!customerId.startsWith('cus_')) {
        throw Object.assign(new Error('stripeCustomerId is required'), { statusCode: 400 });
      }
      const databases = appwriteDatabases();
      const dbId =
        process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
      const teamsColl = platformTeamsTableId();
      const rows = await databases.listDocuments(dbId, teamsColl, [
        Query.equal('stripe_customer_id', customerId),
        Query.limit(2),
      ]);
      const row = rows.documents?.[0];
      if (!row) {
        throw Object.assign(new Error('Team billing record not found for this customer'), { statusCode: 404 });
      }
      const ownerId = String(row.owner_id || '').trim();
      if (ownerId !== String(userId).trim()) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
      }
      const list = await listInvoicesForCustomer(customerId, { limit: 50 });
      return { invoices: list.data.map(mapInvoice) };
    }

    case 'sync-team-stripe-customer-email': {
      const teamId = String(body.teamId ?? body.team_id ?? '').trim();
      if (!teamId) {
        throw Object.assign(new Error('teamId is required'), { statusCode: 400 });
      }
      const tColl = platformTeamsTableId();
      const db =
        process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
      let row;
      try {
        row = await databases.getDocument(db, tColl, teamId);
      } catch {
        throw Object.assign(new Error('Team not found'), { statusCode: 404 });
      }
      if (String(row.owner_id || '').trim() !== String(userId).trim()) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
      }
      return syncStripeTeamCustomerEmail(stripe, databases, teamId);
    }

    case 'transfer-team-ownership': {
      const teamId = String(body.teamId ?? body.team_id ?? '').trim();
      const newOwner = String(body.newOwnerUserId ?? body.new_owner_user_id ?? '').trim();
      if (!teamId || !newOwner) {
        throw Object.assign(new Error('teamId and newOwnerUserId are required'), { statusCode: 400 });
      }
      const tColl = platformTeamsTableId();
      const db =
        process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
      let row;
      try {
        row = await databases.getDocument(db, tColl, teamId);
      } catch {
        throw Object.assign(new Error('Team not found'), { statusCode: 404 });
      }
      if (String(row.owner_id || '').trim() !== String(userId).trim()) {
        throw Object.assign(new Error('Forbidden: only the current owner can transfer ownership'), {
          statusCode: 403,
        });
      }
      if (newOwner === String(userId).trim()) {
        return { success: true, skipped: true, message: 'Already owner.' };
      }
      await databases.updateDocument(db, tColl, teamId, { owner_id: newOwner });
      const stripeSync = await syncStripeTeamCustomerEmail(stripe, databases, teamId);
      return { success: true, teamId, newOwnerUserId: newOwner, stripe: stripeSync };
    }

    default:
      throw Object.assign(new Error(`Unknown billing action: ${action || '(missing)'}`), { statusCode: 400 });
    }
  } finally {
    _stripeAppwriteReq = undefined;
  }
}

export { runUserBillingAction };