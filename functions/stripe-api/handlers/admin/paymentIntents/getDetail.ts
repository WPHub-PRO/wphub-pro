import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { getAdminPaymentIntentDetail } from '../../../lib/services/paymentIntentsFull.ts';

export default async function handleGetPaymentIntentDetail(ctx: StripeApiCtx) {
  const id = ctx.routeParams.id;
  if (!id) return fail(ctx.res, 'Payment intent id is required', 400);
  return runHandlerData(ctx, () => getAdminPaymentIntentDetail(id));
}
