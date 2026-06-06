/**
 * @param {string} plaintext UTF-8 JSON envelope (v1 connection + secrets).
 * @param {string} key
 * @returns {string} Ciphertext or empty string when encryption fails.
 */
export declare function encryptMailSecretsEnvelope(plaintext: any, key: any): string;
/**
 * @param {string} ciphertext
 * @param {string} key
 * @returns {string} Plaintext or empty string on failure / invalid input.
 */
export declare function decryptMailSecretsEnvelope(ciphertext: any, key: any): string;
