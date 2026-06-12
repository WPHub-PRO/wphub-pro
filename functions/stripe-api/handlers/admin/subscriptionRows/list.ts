import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { listAdminSubscriptionRows } from '../../../lib/services/subscriptionRows.ts';

export default async function handleListSubscriptionRows(ctx: StripeApiCtx) {
  const params = {
    status: ctx.searchParams.get('status') || undefined,
    productId: ctx.searchParams.get('productId') || undefined,
    priceId: ctx.searchParams.get('priceId') || undefined,
    search: ctx.searchParams.get('search') || undefined,
    sortField: ctx.searchParams.get('sortField') || undefined,
    sortDir: ctx.searchParams.get('sortDir') || undefined,
    maxPages: ctx.searchParams.get('maxPages') ? Number(ctx.searchParams.get('maxPages')) : undefined,
  };
  return runHandlerData(ctx, () => listAdminSubscriptionRows(params));
}
