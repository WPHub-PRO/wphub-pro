import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { listAdminPaymentIntentRows } from '../../../lib/services/paymentIntentsFull.ts';

export default async function handleListPaymentIntents(ctx: StripeApiCtx) {
  const params = {
    limit: ctx.searchParams.get('limit') ? Number(ctx.searchParams.get('limit')) : undefined,
    customer: ctx.searchParams.get('customer') || undefined,
    status: ctx.searchParams.get('status') || undefined,
  };
  return runHandlerData(ctx, () => listAdminPaymentIntentRows(params));
}
