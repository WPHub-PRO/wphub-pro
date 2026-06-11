import type { StripeApiCtx } from '../../../lib/types.ts';
import { runHandlerData } from '../../../lib/handlerUtils.ts';
import adminTools from '../../../lib/services/adminTools.ts';

export default async function handleBackfillTeamSubscriptionsGet(ctx: StripeApiCtx) {
  return runHandlerData(ctx, () =>
    adminTools.listMissingTeamWorkspaceSubscriptions({
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
