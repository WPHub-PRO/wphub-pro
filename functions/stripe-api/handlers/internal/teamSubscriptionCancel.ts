import type { StripeApiCtx } from '../../lib/types.ts';
import { runHandlerData } from '../../lib/handlerUtils.ts';
import { internalTeamSubscriptionCancel } from '../../lib/services/internalTeamSubscriptionCancel.ts';

export default async function handleTeamSubscriptionCancel(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    internalTeamSubscriptionCancel({
      req: ctx.req,
      databases: ctx.databases!,
      body: ctx.body,
    }),
  );
}
