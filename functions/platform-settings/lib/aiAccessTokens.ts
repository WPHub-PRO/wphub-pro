import { createHash, randomBytes } from 'node:crypto';

const KEY_PREFIX = 'ai_access_';
const DEFAULT_TTL_MINUTES = 60;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 24 * 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function storageKeyForToken(token: string): string {
  return `${KEY_PREFIX}${hashToken(token)}`;
}

function generateAccessToken(): string {
  return randomBytes(32).toString('base64url');
}

function normalizeTtlMinutes(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, Math.floor(n)));
}

export {
  KEY_PREFIX,
  DEFAULT_TTL_MINUTES,
  MIN_TTL_MINUTES,
  MAX_TTL_MINUTES,
  hashToken,
  storageKeyForToken,
  generateAccessToken,
  normalizeTtlMinutes,
};
