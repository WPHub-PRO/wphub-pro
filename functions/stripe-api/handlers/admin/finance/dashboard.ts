import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { getAdminFinanceDashboard } from '../../../lib/services/financeDashboard.ts';

export default async function handleFinanceDashboard(ctx: StripeApiCtx) {
  const period = ctx.searchParams.get('period') || 'week';
  return runHandlerData(ctx, () => getAdminFinanceDashboard(period));
}
