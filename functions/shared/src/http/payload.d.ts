/**
 * Parses Appwrite function `req` body (Hub nested `body.body`, plain JSON, `bodyRaw`, string `payload`).
 */
declare function parsePayload(req: any): any;
/**
 * Parse a JSON string into an object; invalid input yields `fallback`.
 * @template {Record<string, unknown>} T
 * @param {unknown} raw
 * @param {T} fallback
 * @returns {T}
 */
declare function parseOptionalJsonObject(raw: any, fallback: any): any;
export { parsePayload, parseOptionalJsonObject };
