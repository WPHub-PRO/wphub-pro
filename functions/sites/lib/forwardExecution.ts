import { Client, Functions } from '@code045/wphubpro-shared';
import type { SitesLogFn } from './types.ts';

export async function forwardFunctionExecution({
  endpoint,
  projectId,
  apiKey,
  functionId,
  body,
}: {
  endpoint: string;
  projectId: string;
  apiKey: string;
  functionId: string;
  body: Record<string, unknown>;
  log?: SitesLogFn;
  error?: SitesLogFn;
}): Promise<Record<string, unknown>> {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const functions = new Functions(client);
  const response = await functions.createExecution(functionId, JSON.stringify(body), true);
  if (!response.responseBody) {
    throw new Error(`No response from function ${functionId}`);
  }
  const result =
    typeof response.responseBody === 'string' ? JSON.parse(response.responseBody) : response.responseBody;
  if (!result || typeof result !== 'object') {
    throw new Error(`Invalid response from ${functionId}`);
  }
  return result as Record<string, unknown>;
}
