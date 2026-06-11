import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../lib/types.ts';
import { runHandlerData } from '../../lib/handlerUtils.ts';
import accountStripe from '../../lib/services/accountStripe.ts';

export default async function handleListInvoices(ctx: StripeApiCtx) {
  const customerId = ctx.searchParams.get('customerId');
  if (!customerId?.trim()) return fail(ctx.res, 'customerId query parameter is required', 400);
  if (!ctx.executorUserId) return fail(ctx.res, 'Unauthorized', 401);
  return runHandlerData(ctx, () =>
    accountStripe.listCustomerInvoices(ctx.executorUserId!, customerId.trim(), ctx.req),
  );
}
