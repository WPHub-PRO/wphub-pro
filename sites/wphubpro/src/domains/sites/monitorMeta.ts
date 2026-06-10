import type { Site } from '@/types';

/**
 * Parse Appwrite `sites.monitor_meta` (JSON string). Returns `null` when missing or invalid.
 */
export function parseMonitorMeta(raw?: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
    return o as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readExternalUptimeStatus(meta: Record<string, unknown>): string {
  const v = meta.external_uptime_status;
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}

function statusIndicatesDown(status: unknown): boolean {
  if (status === 9 || status === 8) return true;
  const n = Number(status);
  if (Number.isFinite(n) && (n === 9 || n === 8)) return true;

  const s = String(status ?? '').trim().toLowerCase();
  if (!s) return false;
  if (s === 'down') return true;
  if (s.includes('pause')) return false;
  if (s.includes('up')) return false;
  if (s.includes('down')) return true;
  return false;
}

/**
 * True when persisted UptimeRobot / operational snapshot indicates the site is down.
 * Aligns with `uptime-robot` hub rules: UR status 9/8, string containing "down",
 * or `external_uptime_status === "down"`.
 */
export function isSiteMonitorDown(site: Site): boolean {
  const meta = parseMonitorMeta(site.monitorMeta);
  if (!meta) return false;

  if (readExternalUptimeStatus(meta) === 'down') return true;
  if (statusIndicatesDown(meta.status)) return true;

  return false;
}
