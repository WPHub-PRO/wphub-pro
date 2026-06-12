import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import {
  listPlansForAdmin,
  getPlanDetailForAdmin,
  updateAdminPlanProduct,
  setAdminProductActive,
  setAdminPriceActive,
  createAdminPriceForProduct,
} from '../../../lib/services/plansExt.ts';

export default async function handleListCatalog(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    listPlansForAdmin({
      activeOnly: false,
      excludeHidden: false,
      excludeNonSellable: false,
      includeCounts: true,
    }),
  );
}
