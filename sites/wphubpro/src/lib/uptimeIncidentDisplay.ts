import { incidentEndedMs, incidentStartedMs } from '@/lib/uptimeIncidentHours';

export function incidentIso(row: Record<string, unknown>): string | undefined {
  const pick =
    row.startedAt ?? row.started_at ?? row.createdAt ?? row.created_at ?? row.date ?? row.time;
  if (pick == null) return undefined;
  const s = String(pick).trim();
  return s || undefined;
}

function pickResolvedMs(row: Record<string, unknown>): number | null {
  for (const key of ['resolvedAt', 'resolved_at', 'endedAt', 'ended_at'] as const) {
    const v = row[key];
    if (v == null) continue;
    const t = Date.parse(String(v).trim());
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** Resolved vs ongoing when API does not send a status string. */
export function incidentStatusLabel(row: Record<string, unknown>): string {
  const raw =
    (typeof row.status === 'string' && row.status.trim()) ||
    (typeof row.state === 'string' && row.state.trim()) ||
    '';
  if (raw) return raw;
  const resolved = pickResolvedMs(row);
  const started = incidentStartedMs(row);
  if (resolved != null && started > 0 && resolved >= started) return 'Resolved';
  return 'Ongoing';
}

export function incidentRootCause(row: Record<string, unknown>): string {
  const pick = (key: string): string => {
    const v = row[key];
    return typeof v === 'string' ? v.trim() : '';
  };
  return (
    pick('cause') ||
    pick('root_cause') ||
    pick('rootCause') ||
    pick('reason') ||
    pick('message') ||
    pick('detail') ||
    '—'
  );
}

/** Pull first HTTP-style status code (100–599) from root-cause copy for a red badge. */
export function splitRootCauseAndStatusCode(raw: string): { code: string | null; rest: string } {
  const t = raw.trim();
  if (!t || t === '—') return { code: null, rest: t };
  const re = /\b([1-5]\d{2})\b/;
  const m = t.match(re);
  if (!m || m.index === undefined) return { code: null, rest: t };
  const code = m[1];
  const rest = (t.slice(0, m.index) + t.slice(m.index + m[0].length))
    .replace(/^[\s.,:;|/\\-]+|[\s.,:;|/\\-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { code, rest };
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms === 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** e.g. `1 month, 4 days, 23 hours` — uses 30-day months; omits zero units. */
export function formatDurationMonthsDaysHours(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms === 0) return '0 hours';

  const totalHours = Math.floor(ms / 3_600_000);
  const months = Math.floor(totalHours / (30 * 24));
  let remHours = totalHours % (30 * 24);
  const days = Math.floor(remHours / 24);
  const hours = remHours % 24;

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0 || parts.length === 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  return parts.join(', ');
}

export function incidentDurationDisplay(row: Record<string, unknown>): string {
  const nowMs = Date.now();
  const s = incidentStartedMs(row);
  const e = incidentEndedMs(row, nowMs);
  if (s <= 0 || e <= s) return '—';
  return formatDurationMs(e - s);
}

export function incidentStatusBadgeVariant(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('resolved') || l.includes('closed') || l.includes('complete')) return 'success';
  if (l.includes('ongoing') || l.includes('active') || l.includes('started') || l.includes('open')) return 'warning';
  return 'secondary';
}
