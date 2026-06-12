import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { saveTeamBillingAdmin } from '../../../lib/services/teamBillingAdmin.ts';

export default async function handleTeamBillingSave(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    saveTeamBillingAdmin({
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
