import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleCustomerSubscriptions(ctx: StripeApiCtx) {
  const customerId = ctx.routeParams.id;
  if (!customerId) return fail(ctx.res, 'Customer id is required', 400);
  return runHandlerData(ctx, () => adminStripe.listStripeSubscriptionsForCustomerAdmin(ctx.req, customerId));
}
