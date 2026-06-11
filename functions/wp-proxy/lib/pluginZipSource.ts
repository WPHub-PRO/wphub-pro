import type { ZipSource } from './types.ts';

/**
 * Attach canonical `source` (official | local | remote) to a bridge zip body when known.
 */
export function attachZipSource(
  body: Record<string, unknown>,
  ...sources: unknown[]
): Record<string, unknown> {
  for (const raw of sources) {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'official' || s === 'local' || s === 'remote') {
      body.source = s as ZipSource;
      return body;
    }
  }
  return body;
}

/** @deprecated Use attachZipSource — kept for plugin handler imports. */
export const attachPluginZipSource = attachZipSource;
