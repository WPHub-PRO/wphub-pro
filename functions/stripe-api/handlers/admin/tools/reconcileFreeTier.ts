import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { reconcileFreeTierAndCustomers } from '../../../lib/services/adminReconcileFreeTier.ts';

export default async function handleReconcileFreeTier(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    reconcileFreeTierAndCustomers({ req: ctx.req, body: ctx.body, databases: ctx.databases! }),
  );
}
