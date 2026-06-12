import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleCreateProduct(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => adminStripe.createStripeProductAdmin(ctx.body));
}
