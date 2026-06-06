import * as sdk from 'node-appwrite';
import type { Client, Databases, Storage, Teams, Users } from 'node-appwrite';
import { appwriteEndpoint, appwriteProjectId, resolvedAppwriteApiKey } from '../core/env.ts';

type AppwriteFunctionReq = { headers?: Record<string, string> };

type CreateServerClientOptions = {
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
async function createServerClientAndDatabases(options: CreateServerClientOptions = {}) {
  const {
    req,
    includeStorage = false,
    includeCredentialsInReturn = true,
  } = options;
  const endpoint = appwriteEndpoint();
  const projectId = appwriteProjectId();
  const apiKey = resolvedAppwriteApiKey(req);
  if (!endpoint || !projectId || !apiKey) {
    throw new Error(
      'Missing Appwrite server env: endpoint, project id (APPWRITE_PROJECT_ID or APPWRITE_FUNCTION_PROJECT_ID), and API key (APPWRITE_API_KEY / APPWRITE_FUNCTION_API_KEY or x-appwrite-key on req).',
    );
  }
  const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const base: {
    client: Client;
    databases: Databases;
    users: Users;
    teams: Teams;
    storage?: Storage;
  } = {
    client,
    databases: new sdk.Databases(client),
    users: new sdk.Users(client),
    teams: new sdk.Teams(client),
  };
  if (includeStorage) {
    base.storage = new sdk.Storage(client);
  }
  if (includeCredentialsInReturn) {
    return { ...base, endpoint, projectId, apiKey };
  }
  return base;
}

/** Same services as {@link createServerClientAndDatabases} without credentials on the return object. */
async function createServerClients(options = {}) {
  return createServerClientAndDatabases({ ...options, includeCredentialsInReturn: false });
}

export { createServerClientAndDatabases, createServerClients };
