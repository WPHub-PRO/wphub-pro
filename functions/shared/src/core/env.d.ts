/**
 * Project REST base (`…/v1`) for the Server SDK.
 * Order: `APPWRITE_ENDPOINT` → derive from `APPWRITE_FUNCTION_API_ENDPOINT` → bundled default.
 */
declare function appwriteEndpoint(): string;
declare function appwriteProjectId(): string;
/** API key from function env (manual or `APPWRITE_FUNCTION_API_KEY` at build/deploy). */
declare function appwriteApiKey(): string;
/**
 * Per-execution dynamic key (see Appwrite Functions docs — `x-appwrite-key` header).
 * @param {object} [req] Appwrite function `req`
 */
declare function appwriteApiKeyFromReq(req: any): string;
/**
 * Per-execution dynamic key from Appwrite (`x-appwrite-key`) must win over
 * `APPWRITE_FUNCTION_API_KEY`, which is injected at **build** time and can be stale after redeploys.
 * Manual `APPWRITE_API_KEY` overrides both when set on the function.
 */
declare function resolvedAppwriteApiKey(req: any): string;
/** Debug-only: which key source would be used (no secret values). */
declare function describeApiKeyResolution(req: any): {
    source: string;
    keyLen: number;
};
/**
 * @param {object} [req] When set, `x-appwrite-key` is used if no API key env vars are set.
 */
declare function hasAppwriteServerEnv(req: any): boolean;
/**
 * @param {object} [req]
 * @throws {Error & { statusCode?: number }}
 */
declare function requireAppwriteServerTriple(req: any): {
    endpoint: string;
    projectId: string;
    apiKey: string;
};
declare function appwriteDatabaseId(): string;
export { appwriteEndpoint, appwriteProjectId, appwriteApiKey, appwriteApiKeyFromReq, resolvedAppwriteApiKey, describeApiKeyResolution, hasAppwriteServerEnv, requireAppwriteServerTriple, appwriteDatabaseId, };
