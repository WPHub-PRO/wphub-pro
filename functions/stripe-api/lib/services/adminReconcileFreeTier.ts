import { Query, WPHUB_APPWRITE_IDS } from '@code045/wphubpro-shared';
import { getStripe } from '../stripeClient.ts';
import { readPersonalBillingJson } from '../platformPersonalBilling.ts';
import { ensureUserStripeCustomer } from '../ensureUserStripeCustomer.ts';
import {
  subscriptionBlocksFreeTierAttach,
  hasExistingFreeTierSubscription,
  listSubscriptionsForDecision,
  SUBSCRIPTION_EXPAND,
} from '../freeTierSubscription.ts';
import { assertAdmin } from './teamBillingAdmin.ts';

/**
 * Resolve free-tier price: `platform_settings.personal_billing.freePriceId`, then `STRIPE_FREE_PRICE_ID` on the function.
 *
 * @param {{ databases: import('node-appwrite').Databases }} ctx
 */
async function resolveFreePriceId({ databases }) {
  const stored = await readPersonalBillingJson({ databases });
  const fromJson = String(stored?.freePriceId ?? '').trim();
  if (fromJson.startsWith('price_')) return fromJson;
  const env = String(process.env.STRIPE_FREE_PRICE_ID ?? '').trim();
  if (env.startsWith('price_')) return env;
  return '';
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; databases: import('node-appwrite').Databases; users: import('node-appwrite').Users; teams?: import('node-appwrite').Teams; body?: Record<string, unknown>; log?: (s: string) => void }} ctx
 */
async function reconcileFreeTierAndCustomers(ctx) {
  const { req, databases, users, teams, body = {}, log = () => {} } = ctx;
  await assertAdmin({ req, users, teams, log });

  const limitRaw = body && typeof body === 'object' ? body.limit : undefined;
  const maxAccounts = Math.min(5000, Math.max(1, Number(limitRaw) || 500));
  const startAfter =
    body && typeof body === 'object' && typeof body.cursorAfter === 'string'
      ? body.cursorAfter.trim()
      : '';

  const freePriceId = await resolveFreePriceId({ databases });
  if (!freePriceId) {
    throw Object.assign(
      new Error(
        'Free tier price is not configured. Set Admin → Settings → Tools (personal billing), or set STRIPE_FREE_PRICE_ID on stripe-api.',
      ),
      { statusCode: 400, code: 'FREE_PRICE_MISSING' },
    );
  }

  const stripe = getStripe();

  const dbId = String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const accountsColl = WPHUB_APPWRITE_IDS.platformTables.accounts;

  /** @type {{ processed: number; customersCreated: number; freeSubscriptionsCreated: number; skippedPaid: number; skippedAlreadyFree: number; errors: { userId: string; message: string }[] }} */
  const out = {
    processed: 0,
    customersCreated: 0,
    freeSubscriptionsCreated: 0,
    skippedPaid: 0,
    skippedAlreadyFree: 0,
    errors: [],
  };

  /** Pages resume after this Appwrite document `$id` (from prior response `nextCursor`). */
  let listCursor = startAfter || undefined;
  let examined = 0;
  /** @type {string | null} */
  let nextCursor = null;
  let reachedEnd = false;

  pages: while (true) {
    const remaining = maxAccounts - examined;
    if (remaining <= 0) {
      break;
    }
    const pageSize = Math.min(100, remaining);
    const queries = [Query.orderAsc('$id'), Query.limit(pageSize)];
    if (listCursor) queries.push(Query.cursorAfter(listCursor));

    let page;
    try {
      page = await databases.listDocuments(dbId, accountsColl, queries);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw Object.assign(new Error(`Failed to list accounts: ${message}`), { statusCode: 500 });
    }

    const docs = page.documents || [];
    if (docs.length === 0) {
      reachedEnd = true;
      break;
    }

    for (const doc of docs) {
      if (examined >= maxAccounts) {
        nextCursor = typeof doc.$id === 'string' ? doc.$id : null;
        break pages;
      }
      examined++;

      const userId = String(doc.user_id ?? '').trim();
      if (!userId) {
        out.errors.push({ userId: '', message: 'account row missing user_id' });
        continue;
      }

      out.processed++;

      try {
        const { stripeCustomerId, created } = await ensureUserStripeCustomer({
          users,
          databases,
          userId,
        });
        if (created) out.customersCreated++;

        const subs = await listSubscriptionsForDecision(stripe, stripeCustomerId);

        const blocking = subs.some((s) => subscriptionBlocksFreeTierAttach(s, freePriceId));
        if (blocking) {
          out.skippedPaid++;
          continue;
        }

        if (hasExistingFreeTierSubscription(subs, freePriceId)) {
          out.skippedAlreadyFree++;
          continue;
        }

        await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: freePriceId }],
          payment_behavior: 'default_incomplete',
          expand: SUBSCRIPTION_EXPAND,
        });
        out.freeSubscriptionsCreated++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        out.errors.push({ userId, message });
        log(`reconcile user ${userId}: ${message}`);
      }
    }

    const lastDocId = docs[docs.length - 1]?.$id;
    listCursor = typeof lastDocId === 'string' ? lastDocId : undefined;
    if (examined >= maxAccounts) {
      nextCursor = listCursor ?? null;
      break pages;
    }
    if (!listCursor || docs.length < pageSize) {
      reachedEnd = true;
      break;
    }
  }

  return {
    success: true,
    freePriceId,
    note:
      'Free tier price is read from platform_settings key personal_billing (freePriceId), then STRIPE_FREE_PRICE_ID on stripe-api. Pass cursorAfter=nextCursor to continue.',
    accountRowsScanned: examined,
    limit: maxAccounts,
    done: Boolean(reachedEnd && !nextCursor),
    nextCursor,
    processed: out.processed,
    customersCreated: out.customersCreated,
    freeSubscriptionsCreated: out.freeSubscriptionsCreated,
    skippedPaid: out.skippedPaid,
    skippedAlreadyFree: out.skippedAlreadyFree,
    errors: out.errors,
  };
}

export {
  reconcileFreeTierAndCustomers,
  resolveFreePriceId,
};
