import type { Client } from '@code045/wphubpro-shared';
import { getProjectEnvVar } from './projectEnvVar.ts';

function fromProcessEnv(...names: string[]): string {
  for (const name of names) {
    const v = String(process.env[name] || '').trim();
    if (v) return v;
  }
  return '';
}

export function resolvePagespeedInsightsApiKeyFromEnv(): string {
  return fromProcessEnv('GOOGLE_PAGESPEED_API_KEY', 'GOOGLE_API_KEY');
}

export async function resolvePagespeedInsightsApiKey(options: { client?: Client } = {}): Promise<string> {
  const fromEnv = resolvePagespeedInsightsApiKeyFromEnv();
  if (fromEnv) return fromEnv;

  const { client } = options;
  if (!client) return '';

  const pagespeed = await getProjectEnvVar(client, 'GOOGLE_PAGESPEED_API_KEY');
  if (pagespeed) return pagespeed;
  return getProjectEnvVar(client, 'GOOGLE_API_KEY');
}

export async function resolveGoogleCloudConsoleApiKey(options: { client?: Client } = {}): Promise<string> {
  const fromEnv = fromProcessEnv('GOOGLE_CLOUD_API_KEY');
  if (fromEnv) return fromEnv;
  const { client } = options;
  if (!client) return '';
  return getProjectEnvVar(client, 'GOOGLE_CLOUD_API_KEY');
}
