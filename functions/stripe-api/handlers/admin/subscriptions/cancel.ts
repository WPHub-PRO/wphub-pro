import { ok } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { errorMessage, statusFromError } from '../../../lib/handlerUtils.ts';
import { fail } from '@code045/wphubpro-shared';
import adminOps from '../../../lib/services/adminSubscriptionOps.ts';
import { notifySubscriptionChangeIfPossible } from '../../../lib/pushUserNotification.ts';

async function runWithNotify(
  ctx: StripeApiCtx,
  subId: string,
  action: 'cancel' | 'pause' | 'resume' | 'price',
  fn: () => Promise<unknown>,
) {
  try {
    const out = await fn();
    await notifySubscriptionChangeIfPossible(ctx.req, { subscriptionId: subId, action });
    return ok(ctx.res, out);
  } catch (e) {
    return fail(ctx.res, errorMessage(e), statusFromError(e) ?? 500);
  }
}

export default async function handleCancel(ctx: StripeApiCtx) {
  const subId = ctx.routeParams.id;
  if (!subId) return fail(ctx.res, 'Subscription id is required', 400);
  return runWithNotify(ctx, subId, 'cancel', () =>
    adminOps.adminCancelSubscription({ subscriptionId: subId, immediate: !!ctx.body.immediate }),
  );
}
