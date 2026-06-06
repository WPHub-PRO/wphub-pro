/**
 * @typedef {{ provider?: string; from_email?: string; from_name?: string; reply_to?: string; webhook_url?: string }} EmailDeliverySettings
 */
/**
 * @param {import('node-appwrite').Databases | null | undefined} databases
 * @returns {Promise<EmailDeliverySettings>}
 */
declare function loadEmailDeliverySettings(databases: any): Promise<any>;
/**
 * @param {{
 *   databases?: import('node-appwrite').Databases | null;
 *   log?: (s: string) => void;
 *   to: string;
 *   subject: string;
 *   html: string;
 *   text?: string;
 *   deliveryOverride?: EmailDeliverySettings | null;
 * }} opts
 * @returns {Promise<{ ok: boolean; via: string }>}
 */
declare function sendTransactionalEmail(opts: any): Promise<{
    ok: boolean;
    via: string;
}>;
export { sendTransactionalEmail, loadEmailDeliverySettings };
