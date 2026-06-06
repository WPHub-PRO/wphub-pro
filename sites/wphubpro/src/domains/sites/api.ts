import { account, APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import { executeFunctionWithMeta } from '@/integrations/appwrite/executeFunction';
import type {
  HealthAiDryRunAnalyzeResponse,
  HealthAiDryRunPlanResponse,
  HealthAiExecuteOneResponse,
  HealthAiSuggestion,
  HealthDryRunAnswers,
} from '@/types';

export const SITES_FUNCTION_ID = APPWRITE_FUNCTION_IDS.SITES;
export const SITE_HEARTBEAT_POKE_FUNCTION_ID = 'site-heartbeat-poke';

function jwtFromCreateResponse(jwtRes: unknown): string {
  if (typeof jwtRes === 'string') return jwtRes;
  const o = jwtRes as { jwt?: string };
  return typeof o?.jwt === 'string' ? o.jwt : '';
}

export async function invokeUptimeRobot(
  siteId: string,
  action: 'ensure' | 'delete' | 'pause' | 'resume',
): Promise<void> {
  const jwt = jwtFromCreateResponse(await account.createJWT());
  await executeFunctionWithMeta(
    APPWRITE_FUNCTION_IDS.UPTIME_ROBOT,
    { jwt, siteId, action },
    { throwOnHttpError: false },
  );
}

export async function healthAiExecuteOne(
  siteId: string,
  step: HealthAiSuggestion,
): Promise<HealthAiExecuteOneResponse> {
  const jwt = jwtFromCreateResponse(await account.createJWT());
  const { data, statusCode } = await executeFunctionWithMeta<HealthAiExecuteOneResponse>(
    SITES_FUNCTION_ID,
    { action: 'execute_health_ai_step', siteId, jwt, step },
    { throwOnHttpError: false, longRunning: false },
  );
  const d = (data && typeof data === 'object' ? data : {}) as HealthAiExecuteOneResponse;
  if (statusCode < 200 || statusCode >= 300) {
    const msg =
      typeof d.message === 'string' && d.message.trim() ? d.message.trim() : `Request failed (${statusCode})`;
    throw new Error(msg);
  }
  if (!d.success && !d.skipped) {
    throw new Error(d.message?.trim() || 'Step failed.');
  }
  return d;
}

export type HealthAiDryRunContextOverrides = {
  health_meta?: string;
  plugins_meta?: string;
  themes_meta?: string;
};

export async function healthAiDryRunAnalyze(
  siteId: string,
  contextOverrides?: HealthAiDryRunContextOverrides,
): Promise<HealthAiDryRunAnalyzeResponse> {
  const jwt = jwtFromCreateResponse(await account.createJWT());
  const { data, statusCode } = await executeFunctionWithMeta<HealthAiDryRunAnalyzeResponse>(
    SITES_FUNCTION_ID,
    {
      action: 'dry_run_health_ai',
      dryRunPhase: 'analyze',
      siteId,
      jwt,
      ...contextOverrides,
    },
    { throwOnHttpError: false, longRunning: false },
  );
  const d = (data && typeof data === 'object' ? data : {}) as HealthAiDryRunAnalyzeResponse;
  if (statusCode < 200 || statusCode >= 300) {
    const msg =
      typeof d.message === 'string' && d.message.trim() ? d.message.trim() : `Request failed (${statusCode})`;
    throw new Error(msg);
  }
  if (!d.success) {
    throw new Error(d.message?.trim() || 'Dry run analyze failed.');
  }
  return d;
}

export async function healthAiDryRunPlan(
  siteId: string,
  answers: HealthDryRunAnswers,
  contextOverrides?: HealthAiDryRunContextOverrides,
): Promise<HealthAiDryRunPlanResponse> {
  const jwt = jwtFromCreateResponse(await account.createJWT());
  const { data, statusCode } = await executeFunctionWithMeta<HealthAiDryRunPlanResponse>(
    SITES_FUNCTION_ID,
    {
      action: 'dry_run_health_ai',
      dryRunPhase: 'plan',
      siteId,
      jwt,
      answers,
      ...contextOverrides,
    },
    { throwOnHttpError: false, longRunning: false },
  );
  const d = (data && typeof data === 'object' ? data : {}) as HealthAiDryRunPlanResponse;
  if (statusCode < 200 || statusCode >= 300) {
    const msg =
      typeof d.message === 'string' && d.message.trim() ? d.message.trim() : `Request failed (${statusCode})`;
    throw new Error(msg);
  }
  if (!d.success) {
    throw new Error(d.message?.trim() || 'Dry run plan failed.');
  }
  return d;
}
