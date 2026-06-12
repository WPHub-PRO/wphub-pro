import {
  requireAppwriteServerTriple,
  WPHUB_APPWRITE_IDS,
  Query,
  Client,
  Databases,
  sendUserNotificationFromTemplate,
  platformTeamsTableId,
} from '@code045/wphubpro-shared';
import { getStripe } from '../stripeClient.ts';

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function stripeSignatureFromReq(req) {
  if (!req || typeof req !== 'object' || !req.headers || typeof req.headers !== 'object') return '';
  for (const [k, v] of Object.entries(req.headers)) {
    if (String(k).toLowerCase() !== 'stripe-signature') continue;
    if (v == null) return '';
    return Array.isArray(v) ? String(v[0]).trim() : String(v).trim();
  }
  return '';
}

function rawWebhookBody(req, body) {
  if (typeof body === 'string' && body.trim().startsWith('{')) return body;
  if (req && typeof req.bodyRaw === 'string' && req.bodyRaw.trim()) return req.bodyRaw;
  if (req && typeof req.body === 'string' && req.body.trim()) return req.body;
  return '';
}

/**
 * Sync `platform_db.teams` from a Stripe subscription (team customer).
 *
 * @param {import('stripe').Stripe} stripe
 * @param {import('node-appwrite').Databases} databases
 * @param {import('stripe').Stripe.Subscription} sub
 */
async function syncTeamRowFromSubscription(stripe, databases, sub) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId || !String(customerId).startsWith('cus_')) return { updated: false };

  const tColl = platformTeamsTableId();
  const found = await databases.listDocuments(dbId(), tColl, [
    Query.equal('stripe_customer_id', customerId),
    Query.limit(1),
  ]);
  const doc = found.documents?.[0];
  if (!doc || !doc.$id) return { updated: false };

  const subFull = await stripe.subscriptions.retrieve(sub.id, { expand: ['items.data.price.product'] });
  const item0 = subFull.items?.data?.[0];
  const price = item0?.price;
  const prod =
    price && typeof price.product === 'object' && price.product && !('deleted' in price.product)
      ? price.product
      : null;
  const currentPlan =
    (prod && typeof prod.id === 'string' && prod.id) ||
    (typeof price?.product === 'string' ? price.product : null) ||
    null;
  const qty = item0?.quantity != null && Number.isFinite(Number(item0.quantity)) ? Number(item0.quantity) : null;
  const metaSeats = prod?.metadata && String(prod.metadata.seats_included ?? '').trim();
  const parsedMeta = Number(metaSeats);
  let maxSeats = null;
  if (metaSeats && Number.isFinite(parsedMeta) && parsedMeta > 0) {
    maxSeats = Math.max(1, Math.min(999, Math.floor(parsedMeta)));
  } else if (qty != null && qty > 0) {
    maxSeats = Math.max(1, Math.min(999, qty));
  }
  const patch = {
    stripe_subscription_id: subFull.id,
    ...(currentPlan ? { current_plan: currentPlan } : {}),
    ...(maxSeats != null ? { max_seats: maxSeats } : {}),
  };
  await databases.updateDocument(dbId(), tColl, doc.$id, patch);
  return { updated: true, teamDocumentId: doc.$id };
}

/**
 * Stripe webhook: verify signature when raw body + STRIPE_WEBHOOK_SECRET are available.
 * Updates `teams` row for `customer.subscription.*` when `stripe_customer_id` matches.
 *
 * @param {{ req?: unknown; body?: unknown }} ctx
 */
async function handleStripeWebhook(ctx) {
  const req = ctx.req;
  const body = ctx.body;
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    throw Object.assign(new Error('STRIPE_WEBHOOK_SECRET is not configured'), { statusCode: 503 });
  }
  const sig = stripeSignatureFromReq(req);
  const raw = rawWebhookBody(req, body);
  if (!raw || !sig) {
    throw Object.assign(
      new Error(
        'Webhook requires raw JSON body and Stripe-Signature header (configure Stripe → this function with raw body).',
      ),
      { statusCode: 400 },
    );
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    throw Object.assign(new Error(e && e.message ? e.message : 'Invalid webhook signature'), { statusCode: 400 });
  }

  const type = event.type || '';

  const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(req);
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new Databases(client);

  if (type === 'invoice.upcoming') {
    const inv = event.data?.object;
    if (!inv || typeof inv !== 'object') {
      return { received: true, type, handled: false };
    }
    const subRef = inv.subscription;
    const subId =
      typeof subRef === 'string'
        ? subRef
        : subRef && typeof subRef === 'object' && subRef.id
          ? String(subRef.id)
          : '';
    if (!subId || !subId.startsWith('sub_')) {
      return { received: true, type, handled: false };
    }
    try {
      const subRow = await stripe.subscriptions.retrieve(subId);
      const userId = subRow.metadata?.appwrite_owner_id || subRow.metadata?.appwrite_user_id;
      if (!userId) return { received: true, type, handled: false };
      const sm = subRow.metadata && typeof subRow.metadata === 'object' ? subRow.metadata : {};
      const teamFromMeta =
        typeof sm.wphub_team_id === 'string' && sm.wphub_team_id.trim()
          ? sm.wphub_team_id.trim()
          : typeof sm.appwrite_team_id === 'string' && sm.appwrite_team_id.trim()
            ? sm.appwrite_team_id.trim()
            : null;
      const periodEnd =
        subRow.current_period_end != null
          ? new Date(Number(subRow.current_period_end) * 1000).toISOString()
          : '';
      const amt =
        inv.amount_due != null && typeof inv.amount_due === 'number'
          ? String(inv.amount_due / 100)
          : '';
      await sendUserNotificationFromTemplate(databases, {
        eventKey: 'subscription_renewal_upcoming',
        recipientUserId: String(userId),
        teamId: teamFromMeta,
        payload: {
          detail: amt
            ? `Subscription renewal upcoming (about ${amt}).`
            : 'Your subscription renewal is coming up.',
          subscription_id: subId,
          period_end: periodEnd,
          team_id: teamFromMeta || undefined,
        },
      });
      return { received: true, type, handled: true };
    } catch {
      return { received: true, type, handled: false };
    }
  }

  if (!type.startsWith('customer.subscription.')) {
    return { received: true, type, handled: false };
  }

  const sub = event.data && event.data.object;
  if (!sub || typeof sub !== 'object' || !sub.id) {
    return { received: true, type, handled: false };
  }

  const out = await syncTeamRowFromSubscription(stripe, databases, /** @type {any} */ (sub));
  return { received: true, type, handled: Boolean(out.updated), ...out };
}

export { handleStripeWebhook, syncTeamRowFromSubscription };