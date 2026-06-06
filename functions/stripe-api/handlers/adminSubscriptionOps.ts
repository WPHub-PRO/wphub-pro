import { getStripe } from '../lib/stripeClient.ts';

async function adminCancelSubscription(params) {
  const stripe = getStripe();
  if (params.immediate) {
    await stripe.subscriptions.cancel(params.subscriptionId);
  } else {
    await stripe.subscriptions.update(params.subscriptionId, { cancel_at_period_end: true });
  }
  return { success: true };
}

async function adminPauseSubscription(params) {
  const stripe = getStripe();
  const behavior = params.behavior === 'void' ? 'void' : 'mark_uncollectible';
  await stripe.subscriptions.update(params.subscriptionId, {
    pause_collection: { behavior },
  });
  return { success: true };
}

async function adminResumeSubscription(subscriptionId) {
  const stripe = getStripe();
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: null,
  });
  return { success: true };
}

async function adminUpdateSubscriptionPrice(params) {
  const stripe = getStripe();
  const current = await stripe.subscriptions.retrieve(params.subscriptionId, {
    expand: ['items.data.price'],
  });
  const itemId = current.items.data[0]?.id;
  if (!itemId) {
    throw Object.assign(new Error('Subscription has no line items'), { statusCode: 400 });
  }
  let proration = 'create_prorations';
  if (params.proration_behavior === 'none') proration = 'none';
  else if (params.proration_behavior === 'always_invoice') proration = 'always_invoice';

  await stripe.subscriptions.update(params.subscriptionId, {
    items: [{ id: itemId, price: params.newPriceId }],
    proration_behavior: proration,
    expand: [
      'latest_invoice',
      'latest_invoice.payment_intent',
      'items.data.price.product',
      'customer',
    ],
  });
  return { success: true };
}

export default {
  adminCancelSubscription,
  adminPauseSubscription,
  adminResumeSubscription,
  adminUpdateSubscriptionPrice,
};