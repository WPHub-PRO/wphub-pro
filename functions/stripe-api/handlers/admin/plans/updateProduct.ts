import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleUpdateProduct(ctx: StripeApiCtx) {
  const productId = ctx.routeParams.id;
  if (!productId) return fail(ctx.res, 'Product id is required', 400);
  return runHandlerData(ctx, () => adminStripe.updateStripeProductAdmin(productId, ctx.body));
}
