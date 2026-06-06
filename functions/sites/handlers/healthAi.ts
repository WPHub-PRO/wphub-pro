import { ok, fail, requireAppwriteServerTriple, appwriteEndpoint, appwriteProjectId } from '@code045/wphubpro-shared';
import { verifyJwtUser } from '../lib/jwt.ts';
import { forwardFunctionExecution } from '../lib/forwardExecution.ts';

const HEALTH_AI_FUNCTION_ID = 'health-ai-agent';

const TO_HEALTH_AI = {
  get_health_ai_suggestions: 'suggest',
  execute_health_ai_step: 'executeOne',
  dry_run_health_ai: 'dryRun',
};

/**
 * Delegates to existing `health-ai-agent` function (same payloads/responses).
 */
export default async function handleHealthAi({
  req,
  res,
  log,
  error,
  subAction,
}) {
  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'Missing siteId.', 400);

  try {
    const endpoint = appwriteEndpoint();
    const projectId = appwriteProjectId();
    await verifyJwtUser(req, payload, endpoint, projectId);
  } catch (e) {
    return fail(res, e.message || 'Unauthorized', 401);
  }

  const innerAction = TO_HEALTH_AI[subAction];
  if (!innerAction) {
    return fail(
      res,
      'Unknown health AI action. Use get_health_ai_suggestions, execute_health_ai_step, or dry_run_health_ai.',
      400,
    );
  }

  const forwardBody = {
    ...payload,
    action: innerAction,
    siteId,
  };

  try {
    const { endpoint, projectId, apiKey } = requireAppwriteServerTriple(req);
    log(`[sites] health_ai forward → ${HEALTH_AI_FUNCTION_ID} action=${innerAction} site=${siteId}`);
    const result = await forwardFunctionExecution({
      endpoint,
      projectId,
      apiKey,
      functionId: HEALTH_AI_FUNCTION_ID,
      body: forwardBody,
      log,
      error,
    });

    if (result && result.success === false) {
      const st =
        typeof result.httpStatus === 'number' && result.httpStatus >= 400 && result.httpStatus < 600
          ? result.httpStatus
          : 400;
      return res.json(result, st);
    }
    return ok(res, result);
  } catch (e) {
    error(`[sites] health_ai forward: ${e.message}`);
    return fail(res, e.message || 'Health AI forward failed.', 500);
  }
}
