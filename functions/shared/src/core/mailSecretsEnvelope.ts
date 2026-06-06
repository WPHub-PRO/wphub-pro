import * as crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * Derive AES-256 key from WPHUB_MAIL_SECRETS_KEY / ENCRYPTION_KEY (UTF-8 → SHA-256).
 * Ciphertext format: `ivHex:cipherHex:tagHex` (12-byte IV, AES-256-GCM).
 */

function deriveKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest();
}

/**
 * @param {string} plaintext UTF-8 JSON envelope (v1 connection + secrets).
 * @param {string} key
 * @returns {string} Ciphertext or empty string when encryption fails.
 */
export function encryptMailSecretsEnvelope(plaintext, key) {
  if (!plaintext || typeof plaintext !== 'string' || !key) return '';
  try {
    const iv = crypto.randomBytes(12);
    const derivedKey = deriveKey(key);
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
 * @param {string} key
 * @returns {string} Plaintext or empty string on failure / invalid input.
 */
export function decryptMailSecretsEnvelope(ciphertext, key) {
  if (!ciphertext || typeof ciphertext !== 'string' || !key) return '';
  const parts = String(ciphertext).trim().split(':');
  if (parts.length !== 3) return '';
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedBuf = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const derivedKey = deriveKey(key);
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encryptedBuf), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
