import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { getStripeAdminDashboardStats } from '../../../lib/services/adminStats.ts';

export default async function handleGetDashboardStats(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => getStripeAdminDashboardStats());
}
