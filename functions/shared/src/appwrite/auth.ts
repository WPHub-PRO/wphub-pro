/**
 * Execution gateway: Appwrite functions should use execute permission `any`; caller identity is supplied
 * via `APPWRITE_FUNCTION_USER_ID` / `x-appwrite-user-id` (JWT/session). Authorization (admin labels,
 * team membership, invite tokens, etc.) is enforced inside handlers — not via Appwrite role-based execute scopes.
 */

import { readEnv } from '../core/readEnv.ts';

function callerUserIdFromReq(req) {
  const fromEnv = readEnv('APPWRITE_FUNCTION_USER_ID');
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  const h = req.headers || {};
  const v =
    h['x-appwrite-user-id'] ||
    h['X-Appwrite-User-Id'] ||
    h['x-appwrite-function-user-id'] ||
    h['X-Appwrite-Function-User-Id'];
  return v ? String(v).trim() : '';
}

function getAuthUserId(req) {
  const id = callerUserIdFromReq(req);
  return id || null;
}

// Platform admin: user labels only (`admin` / `administrator`). `_teams` kept for call-site compatibility.
async function userIsAdmin(users, _teams, userId, _log) {
  const user = await users.get(userId);
  return (user.labels || []).some((l) => {
    const x = String(l || '').toLowerCase();
    return x === 'admin' || x === 'administrator';
  });
}

export { callerUserIdFromReq, getAuthUserId, userIsAdmin };
