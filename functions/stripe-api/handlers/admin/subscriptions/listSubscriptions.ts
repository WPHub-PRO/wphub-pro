import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleListSubscriptions(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => adminStripe.listStripeSubscriptionsForAdmin());
}

export async function handleGetSubscription(ctx: StripeApiCtx) {
  const id = ctx.routeParams.id;
  if (!id) return fail(ctx.res, 'Subscription id is required', 400);
  return runHandlerData(ctx, () => adminStripe.getStripeSubscriptionForAdmin(id));
}

export async function handleSubscriptionAction(ctx: StripeApiCtx) {
  const id = ctx.routeParams.id;
  if (!id) return fail(ctx.res, 'Subscription id is required', 400);
  const action = ctx.body.action;
  if (action !== 'cancel' && action !== 'pause' && action !== 'resume') {
    return fail(ctx.res, 'Invalid action', 400);
  }
  return runHandlerData(ctx, () =>
    adminStripe.runStripeSubscriptionAdminAction(id, action, {
      cancelAtPeriodEnd: ctx.body.atPeriodEnd === true,
    }),
  );
}
