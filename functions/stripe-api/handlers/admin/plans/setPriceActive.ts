import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { listPlansForAdmin, getPlanDetailForAdmin, updateAdminPlanProduct, setAdminProductActive, setAdminPriceActive, createAdminPriceForProduct } from '../../../lib/services/plansExt.ts';

export default async function handleSetPriceActive(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => setAdminPriceActive(String(ctx.body.priceId ?? ''), !!ctx.body.active));
}
