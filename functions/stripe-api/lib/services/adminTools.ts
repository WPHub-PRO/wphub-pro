import { WPHUB_APPWRITE_IDS, Query } from '@code045/wphubpro-shared'
import { getStripe } from '../stripeClient.ts';
import { hydrateSubscriptionFirstItemProducts } from '../hydrateSubscriptionProducts.ts';
import provisionTeamWorkspace from '../provisionTeamWorkspace.ts';
import isTeamStripeProduct from '../isTeamStripeProduct.ts';
import { platformTeamsTableId } from '@code045/wphubpro-shared';
import { assertAdmin } from './teamBillingAdmin.ts';

const MAX_SUBS_PER_STATUS = 2000;

function teamsColl() {
  return platformTeamsTableId();
}

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

/**
 * @param {import('stripe').Stripe.Subscription} sub
 * @returns {{ prod: import('stripe').Stripe.Product | null; price: import('stripe').Stripe.Price | null }}
 */
function firstItemProduct(sub) {
  const item0 = sub.items?.data?.[0];
  const price = item0?.price && typeof item0.price === 'object' ? item0.price : null;
  const pref = price?.product;
  const prod =
    pref && typeof pref === 'object' && !('deleted' in pref && pref.deleted)
      ? /** @type {import('stripe').Stripe.Product} */ (pref)
      : null;
  return { prod, price };
}

/**
 * @param {import('stripe').Stripe} stripe
 * @param {import('node-appwrite').Databases} databases
 * @returns {Promise<{
 *   examined: number;
 *   teamSubscriptions: number;
 *   skippedHasRow: number;
 *   skippedNotTeam: number;
 *   candidates: {
 *     subscriptionId: string;
 *     status: string;
 *     customerId: string;
 *     customerEmail: string | null;
 *     customerName: string | null;
 *     productId: string | null;
 *     productName: string | null;
 *     teamName: string;
 *     ownerUserId: string | null;
 *     maxSeats: number | null;
 *     proceedable: boolean;
 *     blockReason: string | null;
 *   }[];
 * }>}
 */
async function scanMissingTeamWorkspaceCandidates(stripe, databases) {
  const tColl = teamsColl();
  const db = dbId();

  /** @type {{ examined: number; teamSubscriptions: number; skippedHasRow: number; skippedNotTeam: number; candidates: object[] }} */
  const out = {
    examined: 0,
    teamSubscriptions: 0,
    skippedHasRow: 0,
    skippedNotTeam: 0,
    candidates: [],
  };

  const statuses = /** @type {const} */ (['active', 'trialing']);

  for (const status of statuses) {
    let startingAfter;
    let count = 0;
    while (count < MAX_SUBS_PER_STATUS) {
      const page = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.customer', 'data.items.data.price'],
      });
      await hydrateSubscriptionFirstItemProducts(stripe, page.data);

      for (const sub of page.data) {
        out.examined++;
        const { prod } = firstItemProduct(sub);
        if (!isTeamStripeProduct(prod)) {
          out.skippedNotTeam++;
          continue;
        }
        out.teamSubscriptions++;

        const subId = typeof sub.id === 'string' ? sub.id : '';
        let existing = await databases.listDocuments(db, tColl, [
          Query.equal('stripe_subscription_id', subId),
          Query.limit(1),
        ]);
        if (existing.documents?.[0]) {
          out.skippedHasRow++;
          continue;
        }

        const custRaw = sub.customer;
        const customerId =
          typeof custRaw === 'string'
            ? custRaw
            : custRaw && typeof custRaw === 'object' && !('deleted' in custRaw && custRaw.deleted)
              ? custRaw.id
              : '';
        if (!customerId || !String(customerId).startsWith('cus_')) {
          out.candidates.push({
            subscriptionId: subId,
            status: sub.status,
            customerId: '',
            customerEmail: null,
            customerName: null,
            productId: prod && typeof prod.id === 'string' ? prod.id : null,
            productName: prod && typeof prod.name === 'string' ? prod.name : null,
            teamName: '—',
            ownerUserId: null,
            maxSeats: null,
            proceedable: false,
            blockReason: 'Missing or invalid Stripe customer on subscription',
          });
          continue;
        }

        existing = await databases.listDocuments(db, tColl, [
          Query.equal('stripe_customer_id', customerId),
          Query.limit(1),
        ]);
        if (existing.documents?.[0]) {
          out.skippedHasRow++;
          continue;
        }

        let customer =
          typeof custRaw === 'object' && custRaw && !('deleted' in custRaw && custRaw.deleted) ? custRaw : null;
        if (!customer && customerId) {
          try {
            const c = await stripe.customers.retrieve(customerId);
            customer = 'deleted' in c && c.deleted ? null : /** @type {import('stripe').Stripe.Customer} */ (c);
          } catch (e) {
            out.candidates.push({
              subscriptionId: subId,
              status: sub.status,
              customerId,
              customerEmail: null,
              customerName: null,
              productId: prod && typeof prod.id === 'string' ? prod.id : null,
              productName: prod && typeof prod.name === 'string' ? prod.name : null,
              teamName: '—',
              ownerUserId: null,
              maxSeats: null,
              proceedable: false,
              blockReason: e instanceof Error ? e.message : 'Failed to load Stripe customer',
            });
            continue;
          }
        }
        if (!customer) {
          out.candidates.push({
            subscriptionId: subId,
            status: sub.status,
            customerId,
            customerEmail: null,
            customerName: null,
            productId: prod && typeof prod.id === 'string' ? prod.id : null,
            productName: prod && typeof prod.name === 'string' ? prod.name : null,
            teamName: '—',
            ownerUserId: null,
            maxSeats: null,
            proceedable: false,
            blockReason: 'Stripe customer missing or deleted',
          });
          continue;
        }

        const ownerUserId = String(
          customer.metadata?.appwrite_owner_id || customer.metadata?.appwrite_user_id || '',
        ).trim();
        const meta = prod.metadata || {};
        const metaSeats = String(meta.seats_included ?? '').trim();
        const maxSeats = Math.max(1, Math.min(999, Math.floor(Number(metaSeats)) || 0));
        const teamName =
          String(customer.name || '').trim() ||
          String(customer.email || '').trim() ||
          'Team';

        let blockReason = null;
        if (!ownerUserId) {
          blockReason =
            'Customer metadata appwrite_owner_id is missing (legacy appwrite_user_id accepted)';
        } else if (!metaSeats || maxSeats < 1) {
          blockReason = 'Product metadata seats_included is missing or invalid';
        }

        out.candidates.push({
          subscriptionId: subId,
          status: sub.status,
          customerId,
          customerEmail: customer.email ?? null,
          customerName: customer.name ?? null,
          productId: prod && typeof prod.id === 'string' ? prod.id : null,
          productName: prod && typeof prod.name === 'string' ? prod.name : null,
          teamName,
          ownerUserId: ownerUserId || null,
          maxSeats: blockReason ? null : maxSeats,
          proceedable: !blockReason,
          blockReason,
        });
      }

      count += page.data.length;
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return out;
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; log?: (s: string) => void }} ctx
 */
async function listMissingTeamWorkspaceSubscriptions(ctx) {
  const { req, databases, teams, log = () => {} } = ctx;
  await assertAdmin({ req, users: ctx.users, teams, log });
  const stripe = getStripe();
  const scan = await scanMissingTeamWorkspaceCandidates(stripe, databases);
  return { success: true, ...scan };
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; body?: Record<string, unknown>; log?: (s: string) => void }} ctx
 */
async function backfillTeamWorkspacesFromStripe(ctx) {
  const { req, databases, teams, body = {}, log = () => {} } = ctx;
  await assertAdmin({ req, users: ctx.users, teams, log });

  const rawIds = body.subscriptionIds;
  const subscriptionIds = Array.isArray(rawIds)
    ? rawIds.map((x) => String(x ?? '').trim()).filter((id) => id.startsWith('sub_'))
    : [];
  if (subscriptionIds.length === 0) {
    throw Object.assign(new Error('subscriptionIds must be a non-empty array of Stripe subscription ids'), {
      statusCode: 400,
    });
  }
  const wanted = new Set(subscriptionIds);

  const stripe = getStripe();
  const scan = await scanMissingTeamWorkspaceCandidates(stripe, databases);

  /** @type {{ examined: number; teamSubscriptions: number; skippedHasRow: number; skippedNotTeam: number; created: number; skippedNotRequested: number; errors: { subscriptionId: string; message: string }[] }} */
  const out = {
    examined: scan.examined,
    teamSubscriptions: scan.teamSubscriptions,
    skippedHasRow: scan.skippedHasRow,
    skippedNotTeam: scan.skippedNotTeam,
    created: 0,
    skippedNotRequested: 0,
    errors: [],
  };

  const proceedableById = new Map();
  for (const c of scan.candidates) {
    if (c.proceedable && c.subscriptionId) {
      proceedableById.set(c.subscriptionId, c);
    }
  }

  for (const id of wanted) {
    const c = proceedableById.get(id);
    if (!c) {
      if (scan.candidates.some((x) => x.subscriptionId === id && !x.proceedable)) {
        const row = scan.candidates.find((x) => x.subscriptionId === id);
        out.errors.push({
          subscriptionId: id,
          message: row?.blockReason || 'Subscription cannot be provisioned',
        });
      } else {
        out.skippedNotRequested++;
        out.errors.push({
          subscriptionId: id,
          message: 'Not in missing-team list (already provisioned, not a team product, or not active/trialing)',
        });
      }
      continue;
    }

    const ownerUserId = String(c.ownerUserId || '').trim();
    const maxSeats = /** @type {number} */ (c.maxSeats);
    try {
      await provisionTeamWorkspace({
        databases,
        teams,
        stripe,
        teamName: c.teamName,
        ownerUserId,
        stripeCustomerId: c.customerId,
        stripeSubscriptionId: c.subscriptionId,
        maxSeats,
        currentPlan: c.productId,
      });
      out.created++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.errors.push({ subscriptionId: id, message });
      log(`backfill team sub ${id}: ${message}`);
    }
  }

  return { success: true, ...out };
}

export default {
  listMissingTeamWorkspaceSubscriptions,
  backfillTeamWorkspacesFromStripe,
};