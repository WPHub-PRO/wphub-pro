import {
  callerUserIdFromReq,
  userIsAdmin,
  createServerClientAndDatabases,
} from '@code045/wphubpro-shared';
import { readTeamBillingJson, writeTeamBillingJson } from '../lib/platformTeamBilling.ts';

function defaultConfig() {
  return {
    teamProductId: '',
    teamMonthlyPriceId: '',
    teamYearlyPriceId: '',
  };
}

function normalizeIncomingConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    ...base,
    teamProductId: String(o.teamProductId ?? '').trim(),
    teamMonthlyPriceId: String(o.teamMonthlyPriceId ?? '').trim(),
    teamYearlyPriceId: String(o.teamYearlyPriceId ?? '').trim(),
  };
}

/**
 * @param {import('node-appwrite').Models.Request | { req: import('node-appwrite').Models.Request; log?: (s: string) => void; users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams }} ctx
 * @param {(s: string) => void} [logArg]
 */
async function assertAdmin(ctx, logArg) {
  const normalized =
    ctx && typeof ctx === 'object' && 'headers' in ctx && !('req' in ctx)
      ? { req: ctx, log: logArg ?? (() => {}) }
      : { req: ctx.req, log: ctx.log ?? logArg ?? (() => {}), users: ctx.users, teams: ctx.teams };
  const { req, log = () => {}, users: usersIn, teams: teamsIn } = normalized;
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  const { users, teams } =
    usersIn && teamsIn
      ? { users: usersIn, teams: teamsIn }
      : await createServerClientAndDatabases({ req });
  const ok = await userIsAdmin(users, teams, actor, log);
  if (!ok) {
    throw Object.assign(new Error('Forbidden: Admin access required'), { statusCode: 403 });
  }
  return { users, teams };
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; databases: import('node-appwrite').Databases; users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams; log?: (s: string) => void }} ctx
 */
async function getTeamBillingAdmin(ctx) {
  const { req, databases, log } = ctx;
  await assertAdmin({ req, users: ctx.users, teams: ctx.teams, log });
  const stored = await readTeamBillingJson({ databases });
  const config = stored && typeof stored === 'object' ? normalizeIncomingConfig(stored) : defaultConfig();
  return { config };
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; databases: import('node-appwrite').Databases; body: Record<string, unknown>; users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams; log?: (s: string) => void }} ctx
 */
async function saveTeamBillingAdmin(ctx) {
  const { req, databases, body, log } = ctx;
  await assertAdmin({ req, users: ctx.users, teams: ctx.teams, log });
  const raw = body && typeof body === 'object' ? body.config : null;
  const config = normalizeIncomingConfig(raw);
  await writeTeamBillingJson({ databases }, config);
  return { success: true, config };
}

export {
  getTeamBillingAdmin,
  saveTeamBillingAdmin,
  defaultConfig as defaultTeamBillingConfig,
  assertAdmin,
};
