import type { StripeApiCtx } from '../../lib/types.ts';
import { runHandlerData } from '../../lib/handlerUtils.ts';
import { handleStripeWebhook } from '../../lib/services/stripeWebhook.ts';

export default async function handleWebhook(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => handleStripeWebhook({ req: ctx.req, body: ctx.body }));
}
