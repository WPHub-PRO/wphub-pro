import { readPersonalBillingJson, writePersonalBillingJson } from '../platformPersonalBilling.ts';
import { assertAdmin } from './teamBillingAdmin.ts';

function defaultConfig() {
  return {
    freePriceId: '',
  };
}

function normalizeIncomingConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    ...base,
    freePriceId: String(o.freePriceId ?? '').trim(),
  };
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; databases: import('node-appwrite').Databases; users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams; log?: (s: string) => void }} ctx
 */
async function getPersonalBillingAdmin(ctx) {
  const { req, databases, log } = ctx;
  await assertAdmin({ req, users: ctx.users, teams: ctx.teams, log });
  const stored = await readPersonalBillingJson({ databases });
  const config = stored && typeof stored === 'object' ? normalizeIncomingConfig(stored) : defaultConfig();
  return { config };
}

/**
 * @param {{ req: import('node-appwrite').Models.Request; databases: import('node-appwrite').Databases; body: Record<string, unknown>; users?: import('node-appwrite').Users; teams?: import('node-appwrite').Teams; log?: (s: string) => void }} ctx
 */
async function savePersonalBillingAdmin(ctx) {
  const { req, databases, body, log } = ctx;
  await assertAdmin({ req, users: ctx.users, teams: ctx.teams, log });
  const raw = body && typeof body === 'object' ? body.config : null;
  const config = normalizeIncomingConfig(raw);
  await writePersonalBillingJson({ databases }, config);
  return { success: true, config };
}

export {
  getPersonalBillingAdmin,
  savePersonalBillingAdmin,
  defaultConfig as defaultPersonalBillingConfig,
};
