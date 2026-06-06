/**
 * Parse error messages from wp-proxy / Appwrite function JSON bodies.
 */

export function parseWpProxyFailureMessage(
  data: unknown,
  statusCode: number,
  fallback: string = 'Request failed.',
): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
    if (o.error && typeof o.error === 'object' && typeof (o.error as { message?: string }).message === 'string') {
      const m = (o.error as { message: string }).message.trim();
      if (m) return m;
    }
  }
  if (statusCode > 0) return `${fallback.replace(/\.$/, '')} (HTTP ${statusCode}).`;
  return fallback;
}
