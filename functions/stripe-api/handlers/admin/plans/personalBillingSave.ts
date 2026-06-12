import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { savePersonalBillingAdmin } from '../../../lib/services/personalBillingAdmin.ts';

export default async function handlePersonalBillingSave(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    savePersonalBillingAdmin({
      req: ctx.req,
      body: ctx.body,
      databases: ctx.databases!,
      users: ctx.users!,
      teams: ctx.teams!,
      endpoint: ctx.endpoint!,
      projectId: ctx.projectId!,
      apiKey: ctx.apiKey!,
    }),
  );
}
