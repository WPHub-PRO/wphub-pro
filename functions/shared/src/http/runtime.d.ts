declare function getAppwriteConnection(): {
    endpoint: string;
    projectId: string;
};
declare function appwriteServerApiKey(): string;
/**
 * @param {unknown} err
 * @returns {({ status: number, message: string }) | null}
 */
declare function httpFromAppwriteError(err: any): {
    status: number;
    message: string;
};
export { getAppwriteConnection, appwriteServerApiKey, httpFromAppwriteError };
