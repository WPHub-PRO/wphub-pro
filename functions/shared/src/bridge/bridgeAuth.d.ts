/** @param {unknown} value */
export declare function isBridgeCredentialEnvelope(value: any): boolean;
/**
 * @param {string} plaintext
 * @param {string} encryptionKey
 * @returns {string} Ciphertext or empty string on failure.
 */
export declare function encryptBridgeCredential(plaintext: any, encryptionKey: any): string;
/**
 * @param {string} ciphertext
 * @param {string} encryptionKey
 * @returns {string | null} Plaintext or null on invalid input / decrypt failure.
 */
export declare function decryptBridgeCredential(ciphertext: any, encryptionKey: any): string;
/**
 * @param {string} a
 * @param {string} b
 */
export declare function timingSafeEqualUtf8(a: any, b: any): boolean;
/**
 * Raw credential fields from a platform `sites` document (for inbound secret checks).
 * @param {Record<string, unknown>} siteDoc
 */
export declare function readStoredCredentialsFromSiteDoc(siteDoc: any): {
    siteSecretRaw: string;
    apiKeyRaw: string;
};
/**
 * Decrypt envelope or return trimmed plaintext; null if encrypted value cannot be decrypted.
 * @param {string} raw
 * @param {string} encryptionKey
 * @returns {string | null}
 */
export declare function decryptStoredCredentialField(raw: any, encryptionKey: any): string;
/**
 * @param {Record<string, unknown>} siteDoc
 * @param {string} encryptionKey
 */
export declare function decryptStoredCredentialsFromSiteDoc(siteDoc: any, encryptionKey: any): {
    siteSecretPlain: string;
    apiKeyPlain: string;
};
/**
 * Read outbound bridge API key / secret (Hub → WordPress), same field order as wp-proxy `loadSiteForBridge`.
 * @param {Record<string, unknown>} siteDoc
 * @param {string} encryptionKey
 * @returns {string | null}
 */
export declare function resolveOutboundBridgeSecret(siteDoc: any, encryptionKey: any): string;
/**
 * Bridge → Hub: validate `secret` against `site_secret` and/or `api_key` on the site document.
 * @param {{ siteDoc: Record<string, unknown>; incomingSecret: unknown; encryptionKey: string }} args
 */
export declare function verifyIncomingBridgeSecret(args: any): {
    ok: boolean;
    statusCode: number;
    message: string;
    siteSecretPlain?: undefined;
    apiKeyPlain?: undefined;
} | {
    ok: boolean;
    siteSecretPlain: string;
    apiKeyPlain: string;
    statusCode?: undefined;
    message?: undefined;
};
/**
 * @param {Record<string, unknown>} siteDoc
 * @param {string} encryptionKey
 */
export declare function assertSiteHasOutboundBridgeSecret(siteDoc: any, encryptionKey: any): boolean;
