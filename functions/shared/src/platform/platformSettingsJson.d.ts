declare function databaseId(): string;
declare function platformSettingsColl(): string;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} key
 * @returns {Promise<Record<string, unknown>>}
 */
declare function getPlatformSettingJson(databases: any, key: any): Promise<any>;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} key
 * @param {Record<string, unknown>} json
 */
declare function upsertPlatformSettingJson(databases: any, key: any, json: any): Promise<void>;
export { getPlatformSettingJson, upsertPlatformSettingJson, databaseId, platformSettingsColl };
