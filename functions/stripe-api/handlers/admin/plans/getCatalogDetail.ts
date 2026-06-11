import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { listPlansForAdmin, getPlanDetailForAdmin, updateAdminPlanProduct, setAdminProductActive, setAdminPriceActive, createAdminPriceForProduct } from '../../../lib/services/plansExt.ts';

export default async function handleGetCatalogDetail(ctx: StripeApiCtx) {
  const productId = ctx.routeParams.id;
  if (!productId) return fail(ctx.res, 'Product id is required', 400);
  return runHandlerData(ctx, () => getPlanDetailForAdmin(productId));
}
