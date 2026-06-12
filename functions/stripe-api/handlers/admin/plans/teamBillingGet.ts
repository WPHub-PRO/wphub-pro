import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import { getTeamBillingAdmin } from '../../../lib/services/teamBillingAdmin.ts';

export default async function handleTeamBillingGet(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    getTeamBillingAdmin({
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
