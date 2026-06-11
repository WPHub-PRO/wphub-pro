import { fail } from '@code045/wphubpro-shared';
import type { StripeApiCtx } from '../../lib/types.ts';
import { runHandlerData } from '../../lib/handlerUtils.ts';
import accountStripe from '../../lib/services/accountStripe.ts';

export default async function handlePostSubscription(ctx: StripeApiCtx) {
  if (!ctx.executorUserId) return fail(ctx.res, 'Unauthorized', 401);
  return runHandlerData(ctx, () =>
    accountStripe.postAccountSubscriptions(ctx.executorUserId!, ctx.body, ctx.req),
  );
}
