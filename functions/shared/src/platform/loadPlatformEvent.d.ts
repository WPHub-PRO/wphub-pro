declare function databaseId(): string;
declare function platformEventsColl(): string;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKeyNorm
 */
export declare function loadPlatformEvent(databases: any, eventKeyNorm: any): Promise<{
    event_key: string;
    title: any;
    category: any;
    severity: any;
    notification_enabled: boolean;
    notification_title: any;
    notification_body: any;
    email_enabled: boolean;
    email_template_key: string;
    fromDb: boolean;
}>;
export { platformEventsColl, databaseId as platformEventsDatabaseId };
