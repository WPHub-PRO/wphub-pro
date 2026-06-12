import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminStripe from '../../../lib/services/adminStripe.ts';

export default async function handleSendInvoiceReminder(ctx: StripeApiCtx) {
  const invoiceId = ctx.routeParams.id;
  if (!invoiceId) return fail(ctx.res, 'Invoice id is required', 400);
  return runHandlerData(ctx, () => adminStripe.sendStripeInvoiceReminderForAdmin(invoiceId));
}
