import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { getPersonalBillingAdmin } from '../../../lib/services/personalBillingAdmin.ts';

export default async function handlePersonalBillingGet(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    getPersonalBillingAdmin({
      req: ctx.req,
      databases: ctx.databases!,
      users: ctx.users!,
      teams: ctx.teams!,
      endpoint: ctx.endpoint!,
      projectId: ctx.projectId!,
      apiKey: ctx.apiKey!,
    }),
  );
}
