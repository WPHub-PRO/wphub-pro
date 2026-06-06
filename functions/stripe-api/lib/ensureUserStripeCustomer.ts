import { WPHUB_APPWRITE_IDS, Query, ID } from '@code045/wphubpro-shared'
import { getStripe } from './stripeClient.ts';

const PREFS_KEY = 'stripe_customer_id';

/**
 * Keep `platform_db.accounts.stripe_customer_id` aligned with prefs (and create row if missing).
 *
 * @param {object} params
 * @param {import('node-appwrite').Databases} params.databases
 * @param {string} params.userId
 * @param {string} params.stripeCustomerId
 */
async function syncAccountsStripeCustomerId({ databases, userId, stripeCustomerId }) {
  if (!userId || !stripeCustomerId || !String(stripeCustomerId).startsWith('cus_')) return;
  try {
    const dbId = process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
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

/**
 * Ensure Stripe customer + prefs + accounts row (same behavior as `user-billing` → `ensure-customer`).
 *
 * @param {object} ctx
 * @param {import('node-appwrite').Users} ctx.users
 * @param {import('node-appwrite').Databases} ctx.databases
 * @param {string} ctx.userId
 * @returns {Promise<{ stripeCustomerId: string; created: boolean }>}
 */
async function ensureUserStripeCustomer({ users, databases, userId }) {
  const stripe = getStripe();
  const uid = String(userId || '').trim();
  if (!uid) {
    throw Object.assign(new Error('userId is required'), { statusCode: 400 });
  }

  const prefs = (await users.get(uid)).prefs ?? {};
  const existingId = prefs[PREFS_KEY];
  if (typeof existingId === 'string' && existingId.startsWith('cus_')) {
    try {
      const customer = await stripe.customers.retrieve(existingId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      if (!('deleted' in customer && customer.deleted)) {
        await syncAccountsStripeCustomerId({ databases, userId: uid, stripeCustomerId: customer.id });
        return { stripeCustomerId: customer.id, created: false };
      }
    } catch {
      /* create fresh customer below */
    }
  }

  const u = await users.get(uid);
  const customer = await stripe.customers.create({
    email: typeof u.email === 'string' ? u.email : undefined,
    name: typeof u.name === 'string' ? u.name : undefined,
    metadata: { appwrite_user_id: uid },
    expand: ['invoice_settings.default_payment_method'],
  });

  await users.updatePrefs({
    userId: uid,
    prefs: {
      ...prefs,
      [PREFS_KEY]: customer.id,
    },
  });

  await syncAccountsStripeCustomerId({ databases, userId: uid, stripeCustomerId: customer.id });

  return { stripeCustomerId: customer.id, created: true };
}

export {
  ensureUserStripeCustomer,
  syncAccountsStripeCustomerId,
  PREFS_KEY,
};