import type { Client } from '@code045/wphubpro-shared';

const CACHE_MS = 60_000;
let cachedRows: Array<{ key?: string; value?: string }> | null = null;
let cacheAt = 0;

async function listProjectVariables(client: Client): Promise<Array<{ key?: string; value?: string }>> {
  const uri = new URL(`${client.config.endpoint}/project/variables`);
  const res = await client.call('get', uri, {}, { total: 'false' });
  const rows = (res as { variables?: unknown })?.variables ?? res ?? [];
  return Array.isArray(rows) ? rows : [];
}

export async function getProjectEnvVar(client: Client, key: string): Promise<string> {
  const norm = String(key || '')
    .trim()
    .toUpperCase();
  if (!norm || !client) return '';

  const now = Date.now();
  if (!cachedRows || now - cacheAt > CACHE_MS) {
    cachedRows = await listProjectVariables(client);
    cacheAt = now;
  }

  const row = cachedRows.find(
    (v) =>
      String(v.key || '')
        .trim()
        .toUpperCase() === norm,
  );
  return row ? String(row.value ?? '').trim() : '';
}
