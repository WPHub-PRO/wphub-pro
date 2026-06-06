import { WPHUB_DEFAULT_APPWRITE_ENDPOINT, WPHUB_DEFAULT_DATABASE_ID } from './config.ts';
import { readEnv } from './readEnv.ts';

/**
 * Appwrite injects the function/runtime API URL. The **project** REST base for
 * `node-appwrite` is the same origin with path `/v1` when the URL contains `/v1/`.
 */
function projectEndpointFromFunctionApiEndpoint() {
  const raw = readEnv('APPWRITE_FUNCTION_API_ENDPOINT');
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const path = u.pathname || '';
    if (path === '/v1' || path.startsWith('/v1/')) {
      return `${u.origin}/v1`.replace(/\/+$/, '');
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}

/**
 * Project REST base (`…/v1`) for the Server SDK.
 * Order: `APPWRITE_ENDPOINT` → derive from `APPWRITE_FUNCTION_API_ENDPOINT` → bundled default.
 */
function appwriteEndpoint() {
  const explicit = readEnv('APPWRITE_ENDPOINT');
  if (explicit) return explicit;
  const derived = projectEndpointFromFunctionApiEndpoint();
  if (derived) return derived;
  return (WPHUB_DEFAULT_APPWRITE_ENDPOINT || '').trim();
}

function appwriteProjectId() {
  return readEnv('APPWRITE_PROJECT_ID') || readEnv('APPWRITE_FUNCTION_PROJECT_ID');
}

/** API key from function env (manual or `APPWRITE_FUNCTION_API_KEY` at build/deploy). */
function appwriteApiKey() {
  return readEnv('APPWRITE_API_KEY') || readEnv('APPWRITE_FUNCTION_API_KEY');
}

/**
 * Per-execution dynamic key (see Appwrite Functions docs — `x-appwrite-key` header).
 * @param {object} [req] Appwrite function `req`
 */
function appwriteApiKeyFromReq(req) {
  if (!req || typeof req !== 'object' || !req.headers || typeof req.headers !== 'object') return '';
  for (const [k, v] of Object.entries(req.headers)) {
    if (String(k).toLowerCase() !== 'x-appwrite-key') continue;
    if (v == null) return '';
    const s = Array.isArray(v) ? String(v[0]) : String(v);
    return s.trim();
  }
  return '';
}

/**
 * Per-execution dynamic key from Appwrite (`x-appwrite-key`) must win over
 * `APPWRITE_FUNCTION_API_KEY`, which is injected at **build** time and can be stale after redeploys.
 * Manual `APPWRITE_API_KEY` overrides both when set on the function.
 */
function resolvedAppwriteApiKey(req) {
  const fromReq = appwriteApiKeyFromReq(req);
  if (fromReq) return fromReq;
  const manual = readEnv('APPWRITE_API_KEY');
  if (manual) return manual;
  return readEnv('APPWRITE_FUNCTION_API_KEY');
}

/** Debug-only: which key source would be used (no secret values). */
function describeApiKeyResolution(req) {
  const fromReq = appwriteApiKeyFromReq(req);
  if (fromReq) return { source: 'x-appwrite-key', keyLen: fromReq.length };
  const manual = readEnv('APPWRITE_API_KEY');
  if (manual) return { source: 'APPWRITE_API_KEY', keyLen: manual.length };
  const fn = readEnv('APPWRITE_FUNCTION_API_KEY');
  if (fn) return { source: 'APPWRITE_FUNCTION_API_KEY', keyLen: fn.length };
  return { source: 'none', keyLen: 0 };
}

/**
 * @param {object} [req] When set, `x-appwrite-key` is used if no API key env vars are set.
 */
function hasAppwriteServerEnv(req) {
  return !!(appwriteEndpoint() && appwriteProjectId() && resolvedAppwriteApiKey(req));
}

/**
 * @param {object} [req]
 * @throws {Error & { statusCode?: number }}
 */
function requireAppwriteServerTriple(req) {
  const endpoint = appwriteEndpoint();
  const projectId = appwriteProjectId();
  const apiKey = resolvedAppwriteApiKey(req);
  if (!endpoint || !projectId || !apiKey) {
    throw Object.assign(
      new Error(
        'Missing Appwrite server env: set APPWRITE_ENDPOINT (or rely on APPWRITE_FUNCTION_API_ENDPOINT / bundled default), project id (APPWRITE_PROJECT_ID or APPWRITE_FUNCTION_PROJECT_ID), and API key (APPWRITE_API_KEY / APPWRITE_FUNCTION_API_KEY or x-appwrite-key on the request).',
      ),
      { statusCode: 500 },
    );
  }
  return { endpoint, projectId, apiKey };
}

function appwriteDatabaseId() {
  return readEnv('APPWRITE_DATABASE_ID') || WPHUB_DEFAULT_DATABASE_ID;
}

export {
  appwriteEndpoint,
  appwriteProjectId,
  appwriteApiKey,
  appwriteApiKeyFromReq,
  resolvedAppwriteApiKey,
  describeApiKeyResolution,
  hasAppwriteServerEnv,
  requireAppwriteServerTriple,
  appwriteDatabaseId,
};
