import {appwriteEndpoint, appwriteProjectId, Client, Account} from '@code045/wphubpro-shared';

function flattenHeaders(raw) {
  const out = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && entry.name != null) {
        out[String(entry.name).toLowerCase()] = entry.value != null ? String(entry.value) : '';
      }
    }
    return out;
  }
  if (typeof raw.forEach === 'function') {
    try {
      raw.forEach((value, name) => {
        out[String(name).toLowerCase()] = String(value);
      });
      return out;
    } catch {
      /* fall through */
    }
  }
  if (typeof raw.get === 'function') {
    const tryKeys = [
      'x-appwrite-user-id',
      'x-appwrite-function-user-id',
      'x-appwrite-user-jwt',
      'x-appwrite-jwt',
      'authorization',
      'x-appwrite-impersonate-user-id',
    ];
    for (const k of tryKeys) {
      try {
        const v = raw.get(k) || raw.get(k.replace(/^x-/, 'X-'));
        if (v) out[k] = String(v);
      } catch {
        /* ignore */
      }
    }
    return out;
  }
  if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (v != null) out[String(k).toLowerCase()] = String(v);
    }
  }
  return out;
}

function userIdFromEnv(req) {
  const vars = req?.variables && typeof req.variables === 'object' ? req.variables : {};
  const v =
    vars.APPWRITE_FUNCTION_USER_ID ||
    process.env.APPWRITE_FUNCTION_USER_ID ||
    null;
  return v && String(v).trim() ? String(v).trim() : null;
}

function getExecutorUserIdSync(req) {
  const flat = flattenHeaders(req?.headers);
  const fromHeaders =
    flat['x-appwrite-user-id'] ||
    flat['x-appwrite-function-user-id'] ||
    userIdFromEnv(req) ||
    flat['x-appwrite-impersonate-user-id'] ||
    null;
  return fromHeaders && String(fromHeaders).trim() ? String(fromHeaders).trim() : null;
}

function pickJwtFromFlatHeaders(flat) {
  const auth = flat['authorization'] || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth.trim();
  const direct = flat['x-appwrite-user-jwt'] || flat['x-appwrite-jwt'] || '';
  const token = (direct && direct.trim()) || bearer || '';
  const parts = token ? token.split('.') : [];
  return parts.length === 3 && parts.every((p) => p && p.length >= 10) ? token : null;
}

/**
 * @param {import('node-appwrite').Client} req
 */
async function resolveExecutorUserId(req) {
  const syncId = getExecutorUserIdSync(req);
  if (syncId) return syncId;
  const endpoint = appwriteEndpoint();
  const projectId = appwriteProjectId();
  if (!endpoint || !projectId) return null;
  const flat = flattenHeaders(req?.headers);
  const jwt = pickJwtFromFlatHeaders(flat);
  if (!jwt) return null;
  try {
    const jwtClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
    const account = new Account(jwtClient);
    const me = await account.get();
    return me.$id && String(me.$id).trim() ? String(me.$id).trim() : null;
  } catch {
    return null;
  }
}

export { resolveExecutorUserId, getExecutorUserIdSync };