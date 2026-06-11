import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleRecentInvoices(ctx: StripeApiCtx) {
  const limit = ctx.searchParams.get('limit') ? Number(ctx.searchParams.get('limit')) : 25;
  return runHandlerData(ctx, () => adminStripe.listAdminInvoicesRecent(limit));
}
