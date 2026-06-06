import * as sdk from 'node-appwrite';
import type { Client, Databases, Storage, Teams, Users } from 'node-appwrite';
declare type AppwriteFunctionReq = {
    headers?: Record<string, string>;
};
declare type CreateServerClientOptions = {
    req?: AppwriteFunctionReq;
    includeStorage?: boolean;
    includeCredentialsInReturn?: boolean;
};
/**
 * @param {CreateServerClientOptions} [options]
 * @param {object} [options.req] Appwrite function request — supplies `x-appwrite-key` when env API key is unset
 * @param {boolean} [options.includeStorage] — e.g. bridge bucket uploads
 * @param {boolean} [options.includeCredentialsInReturn=true] — expose endpoint, projectId, apiKey on the return object
 */
declare function createServerClientAndDatabases(options?: CreateServerClientOptions): Promise<{
    client: Client;
    databases: Databases;
    users: Users;
    teams: Teams;
    storage?: Storage;
} | {
    endpoint: string;
    projectId: string;
    apiKey: string;
    client: Client;
    databases: Databases;
    users: Users;
    teams: Teams;
    storage?: Storage;
}>;
/** Same services as {@link createServerClientAndDatabases} without credentials on the return object. */
declare function createServerClients(options?: {}): Promise<{
    client: sdk.Client;
    databases: sdk.Databases;
    users: sdk.Users;
    teams: sdk.Teams;
    storage?: sdk.Storage;
} | {
    endpoint: string;
    projectId: string;
    apiKey: string;
    client: sdk.Client;
    databases: sdk.Databases;
    users: sdk.Users;
    teams: sdk.Teams;
    storage?: sdk.Storage;
}>;
export { createServerClientAndDatabases, createServerClients };
