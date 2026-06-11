import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { listPlansForAdmin, getPlanDetailForAdmin, updateAdminPlanProduct, setAdminProductActive, setAdminPriceActive, createAdminPriceForProduct } from '../../../lib/services/plansExt.ts';

export default async function handleSetProductActive(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => setAdminProductActive(String(ctx.body.productId ?? ''), !!ctx.body.active));
}
