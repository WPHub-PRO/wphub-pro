import { Client, Account } from '@code045/wphubpro-shared';
import type { SitesAppwriteReq, SitesPayload } from './types.ts';

export function isValidJwtFormat(t: string): boolean {
  const parts = t ? t.split('.') : [];
  return parts.length === 3 && parts.every((p) => p && p.length >= 10);
}

export function extractJwt(req: SitesAppwriteReq, payload: SitesPayload): string {
  const authHeader =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    req.headers?.['x-appwrite-user-jwt'] ||
    req.headers?.['x-appwrite-jwt'] ||
    '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const bodyToken = typeof payload?.jwt === 'string' ? payload.jwt.trim() : '';
  if (isValidJwtFormat(bodyToken)) return bodyToken;
  if (isValidJwtFormat(headerToken)) return headerToken;
  return headerToken || bodyToken || '';
} 
 
export async function verifyJwtUser(
  req: SitesAppwriteReq,
  payload: SitesPayload,
  endpoint: string,
  projectId: string,
): Promise<{ userId: string; account: Awaited<ReturnType<Account['get']>> }> {
  const token = extractJwt(req, payload);
  if (!token || !isValidJwtFormat(token)) {
    const err = new Error('Missing or invalid JWT.') as Error & { code?: number };
    err.code = 401;
    throw err;
  }
  const jwtClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(token);
  const account = new Account(jwtClient);
  const jwtUser = await account.get();
  const userId = jwtUser?.$id;
  if (!userId) {
    const err = new Error('Could not determine user from JWT.') as Error & { code?: number };
    err.code = 401;
    throw err;
  }
  return { userId, account: jwtUser };
}
