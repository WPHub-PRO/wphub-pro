import type { StripeApiCtx } from '../../lib/types.ts';
import { runHandlerData } from '../../lib/handlerUtils.ts';
import accountStripe from '../../lib/services/accountStripe.ts';

export default async function handleListPlans(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => accountStripe.getPublicCatalogPlans());
}
