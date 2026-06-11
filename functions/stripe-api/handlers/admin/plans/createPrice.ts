import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleCreatePrice(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => adminStripe.createStripePriceAdmin(ctx.body));
}
