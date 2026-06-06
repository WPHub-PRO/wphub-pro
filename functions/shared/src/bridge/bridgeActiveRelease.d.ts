export declare const BRIDGE_SETTINGS_KEY = "bridge_plugin";
export declare const BRIDGE_DOC_CURRENT = "current";
export declare function isBridgeSemver(v: any): boolean;
export declare function compareSemver(a: any, b: any): 0 | 1 | -1;
export declare function activeSemverFromBridgePluginJson(parsed: any): string;
export declare function bridgeLatestAdvertisedSemver(parsed: any): string;
export declare function getBridgeDocumentByVersion(databases: any, semver: any): Promise<any>;
export declare function getBridgeCurrentDocument(databases: any): Promise<any>;
export declare function resolveActiveBridgeDownloadRow(databases: any, log: any): Promise<{
    version: string;
    file_id: string;
    source: string;
}>;
export declare function listBridgeReleasedVersions(databases: any): Promise<any[]>;
