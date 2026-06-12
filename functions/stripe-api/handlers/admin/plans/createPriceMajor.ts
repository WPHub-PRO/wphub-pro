import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { listPlansForAdmin, getPlanDetailForAdmin, updateAdminPlanProduct, setAdminProductActive, setAdminPriceActive, createAdminPriceForProduct } from '../../../lib/services/plansExt.ts';

export default async function handleCreatePriceMajor(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    createAdminPriceForProduct({
      product_id: String(ctx.body.product_id ?? ''),
      amount: Number(ctx.body.amount),
      interval: ctx.body.interval,
      currency: ctx.body.currency,
    }),
  );
}
