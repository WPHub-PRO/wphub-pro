/**
 * Site bridge credentials: AES-256-GCM envelope `ivHex:cipherHex:tagHex` (same format as other Hub secrets).
 * Used by Appwrite functions `sites` and `wp-proxy` — not for mail secrets envelopes.
 */
import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

function deriveKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest();
}

/** @param {unknown} value */
export function isBridgeCredentialEnvelope(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every((p) => p && p.length >= 8);
}

/**
 * @param {string} plaintext
 * @param {string} encryptionKey
 * @returns {string} Ciphertext or empty string on failure.
 */
export function encryptBridgeCredential(plaintext, encryptionKey) {
  if (!plaintext || typeof plaintext !== 'string' || !encryptionKey) return '';
  try {
    const iv = crypto.randomBytes(12);
    const derivedKey = deriveKey(encryptionKey);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
  } catch {
    return '';
  }
}

/**
 * @param {string} ciphertext
 * @param {string} encryptionKey
 * @returns {string | null} Plaintext or null on invalid input / decrypt failure.
 */
export function decryptBridgeCredential(ciphertext, encryptionKey) {
  if (!ciphertext || typeof ciphertext !== 'string' || !encryptionKey) return null;
  const parts = String(ciphertext).trim().split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedBuf = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const derivedKey = deriveKey(encryptionKey);
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encryptedBuf), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqualUtf8(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Raw credential fields from a platform `sites` document (for inbound secret checks).
 * @param {Record<string, unknown>} siteDoc
 */
export function readStoredCredentialsFromSiteDoc(siteDoc) {
  const siteSecretRaw = siteDoc.site_secret != null ? String(siteDoc.site_secret) : '';
  const apiKeyRaw =
    siteDoc.api_key != null
      ? String(siteDoc.api_key)
      : siteDoc.apiKey != null
        ? String(siteDoc.apiKey)
        : '';
  return { siteSecretRaw, apiKeyRaw };
}

/**
 * Decrypt envelope or return trimmed plaintext; null if encrypted value cannot be decrypted.
 * @param {string} raw
 * @param {string} encryptionKey
 * @returns {string | null}
 */
export function decryptStoredCredentialField(raw, encryptionKey) {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  if (isBridgeCredentialEnvelope(t)) {
    if (!encryptionKey) return null;
    const plain = decryptBridgeCredential(t, encryptionKey);
    if (plain === null) return null;
    return plain.trim();
  }
  return t;
}

/**
 * @param {Record<string, unknown>} siteDoc
 * @param {string} encryptionKey
 */
export function decryptStoredCredentialsFromSiteDoc(siteDoc, encryptionKey) {
  const { siteSecretRaw, apiKeyRaw } = readStoredCredentialsFromSiteDoc(siteDoc);
  return {
    siteSecretPlain: decryptStoredCredentialField(siteSecretRaw, encryptionKey),
    apiKeyPlain: decryptStoredCredentialField(apiKeyRaw, encryptionKey),
  };
}

/**
 * Read outbound bridge API key / secret (Hub → WordPress), same field order as wp-proxy `loadSiteForBridge`.
 * @param {Record<string, unknown>} siteDoc
 * @param {string} encryptionKey
 * @returns {string | null}
 */
export function resolveOutboundBridgeSecret(siteDoc, encryptionKey) {
  let storedKey = siteDoc.api_key ?? siteDoc.apiKey ?? siteDoc.bridge_secret;
  const data = siteDoc.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    storedKey = storedKey ?? data.api_key ?? data.apiKey ?? data.bridge_secret;
  }
  if (storedKey == null || typeof storedKey !== 'string') return null;
  const t = storedKey.trim();
  if (!t) return null;
  if (isBridgeCredentialEnvelope(t)) {
    if (!encryptionKey) return null;
    const plain = decryptBridgeCredential(t, encryptionKey);
    if (plain === null || !plain.trim()) return null;
    return plain.trim();
  }
  return t;
}

/**
 * Bridge → Hub: validate `secret` against `site_secret` and/or `api_key` on the site document.
 * @param {{ siteDoc: Record<string, unknown>; incomingSecret: unknown; encryptionKey: string }} args
 */
export function verifyIncomingBridgeSecret(args) {
  const { siteDoc, incomingSecret, encryptionKey } = args;
  const { siteSecretPlain, apiKeyPlain } = decryptStoredCredentialsFromSiteDoc(siteDoc, encryptionKey);

  const siteOk = siteSecretPlain !== null && siteSecretPlain !== '';
  const apiOk = apiKeyPlain !== null && apiKeyPlain !== '';
  if (!siteOk && !apiOk) {
    return { ok: false, statusCode: 400, message: 'Site has no site_secret or api_key.' };
  }

  let inc = typeof incomingSecret === 'string' ? incomingSecret : String(incomingSecret ?? '');
  inc = inc.trim();
  if (isBridgeCredentialEnvelope(inc)) {
    if (!encryptionKey) {
      return { ok: false, statusCode: 401, message: 'Invalid secret.' };
    }
    const d = decryptBridgeCredential(inc, encryptionKey);
    if (d === null) {
      return { ok: false, statusCode: 401, message: 'Invalid secret.' };
    }
    inc = d.trim();
  }
  if (!inc) {
    return { ok: false, statusCode: 401, message: 'Invalid secret.' };
  }

  const storedSite = siteSecretPlain !== null ? siteSecretPlain : '';
  const storedApi = apiKeyPlain !== null ? apiKeyPlain : '';

  const matchSite = storedSite && timingSafeEqualUtf8(inc, storedSite);
  const matchApi = storedApi && timingSafeEqualUtf8(inc, storedApi);
  if (!matchSite && !matchApi) {
    return { ok: false, statusCode: 401, message: 'Invalid secret.' };
  }

  return { ok: true, siteSecretPlain: storedSite, apiKeyPlain: storedApi };
}

/**
 * @param {Record<string, unknown>} siteDoc
 * @param {string} encryptionKey
 */
export function assertSiteHasOutboundBridgeSecret(siteDoc, encryptionKey) {
  const s = resolveOutboundBridgeSecret(siteDoc, encryptionKey);
  return typeof s === 'string' && s.length > 0;
}
