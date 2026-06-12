import type { StripeApiCtx } from '../../lib/types.ts';
import { runHandlerData } from '../../lib/handlerUtils.ts';
import { getPublishableConfig } from '../../lib/services/config.ts';

export default async function handleGetConfig(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () => getPublishableConfig());
}
