import { fail } from '@code045/wphubpro-shared';
import type { WpProxyCtx } from '../../lib/types.ts';

export default async function handleThemesDeactivate(ctx: WpProxyCtx) {
  const { res } = ctx;
  return fail(
    res,
    'Theme deactivate is not exposed by the WPHub Pro bridge REST API in this deployment. Switch themes in WordPress admin.',
    501,
  );
}
