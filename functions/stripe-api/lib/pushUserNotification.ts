import {requireAppwriteServerTriple, emitPlatformEvent, Client, Databases, Users} from '@code045/wphubpro-shared';
import { getStripe } from './stripeClient.ts';

const TYPES = {
  cancel: { title: 'Subscription update', body: (plan) => `Your subscription for ${plan} was canceled or scheduled to end.` },
  pause: { title: 'Subscription paused', body: (plan) => `Your ${plan} subscription was paused.` },
  resume: { title: 'Subscription resumed', body: (plan) => `Your ${plan} subscription was resumed.` },
  price: { title: 'Plan changed', body: (plan) => `Your subscription was updated (${plan}).` },
};

/**
 * @param {unknown} req
 * @param {{ subscriptionId: string; action: 'cancel' | 'pause' | 'resume' | 'price' }} args
 */
async function notifySubscriptionChangeIfPossible(req, args) {
  try {
    const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(req);
    const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(client);
    const users = new Users(client);

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(args.subscriptionId, {
      expand: ['items.data.price.product'],
    });
    const userId = sub.metadata?.appwrite_owner_id || sub.metadata?.appwrite_user_id;
    if (!userId) return;

    const meta = sub.metadata && typeof sub.metadata === 'object' ? sub.metadata : {};
    const teamFromMeta =
      typeof meta.wphub_team_id === 'string' && meta.wphub_team_id.trim()
        ? meta.wphub_team_id.trim()
        : typeof meta.appwrite_team_id === 'string' && meta.appwrite_team_id.trim()
          ? meta.appwrite_team_id.trim()
          : null;

    const product = sub.items?.data?.[0]?.price?.product;
    const planName =
      typeof product === 'object' && product && 'name' in product && product.name
        ? String(product.name)
        : 'your plan';
    const copy = TYPES[args.action] || TYPES.cancel;
    const body = copy.body(planName);
    const title = copy.title;

    await emitPlatformEvent(databases, { users, teams: null }, {
      eventKey: 'subscription_change',
      recipientUserId: String(userId),
      teamId: teamFromMeta,
      payload: {
        title,
        body,
        plan_name: planName,
        change_kind: args.action,
        subscription_id: sub.id,
        team_id: teamFromMeta || undefined,
      },
    });
  } catch {
    /* best-effort */
  }
}

export { notifySubscriptionChangeIfPossible };