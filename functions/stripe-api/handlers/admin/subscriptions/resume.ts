import { fail, ok } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { errorMessage, statusFromError } from '../../../lib/handlerUtils.ts';
import adminOps from '../../../lib/services/adminSubscriptionOps.ts';
import { notifySubscriptionChangeIfPossible } from '../../../lib/pushUserNotification.ts';

export default async function handleResume(ctx: StripeApiCtx) {
  const subId = ctx.routeParams.id;
  if (!subId) return fail(ctx.res, 'Subscription id is required', 400);
  try {
    const out = await adminOps.adminResumeSubscription(subId);
    await notifySubscriptionChangeIfPossible(ctx.req, { subscriptionId: subId, action: 'resume' });
    return ok(ctx.res, out);
  } catch (e) {
    return fail(ctx.res, errorMessage(e), statusFromError(e) ?? 500);
  }
}
