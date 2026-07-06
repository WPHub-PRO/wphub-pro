export type BulkLogRowStatus = 'success' | 'partial' | 'failure' | 'unknown';

export type BulkLogStatusInfo = {
  status: BulkLogRowStatus;
  label: string;
};

export type BulkResultItem = {
  id: string;
  label: string;
  ok: boolean;
};

export type ParsedBulkLogResponse = {
  status: BulkLogStatusInfo;
  items: BulkResultItem[];
};

type OutgoingLogDurationRow = {
  time?: string;
  endpoint?: string;
  duration?: number;
};

function logTimeMs(time: string | undefined): number {
  if (!time) return 0;
  const ms = Date.parse(time);
  return Number.isNaN(ms) ? 0 : ms;
}

function normalizeManageEndpoint(path: string): string {
  const normalized = path.toLowerCase().replace(/\\/g, '/').trim();
  const match = normalized.match(/(?:^|\/)((?:plugins|themes)\/manage\/[^/?]+)/);
  return match ? match[1] : normalized;
}

function manageEndpointKey(kind: 'plugin' | 'theme', action: string): string {
  const collection = kind === 'theme' ? 'themes' : 'plugins';
  return `${collection}/manage/${action.toLowerCase().trim()}`;
}

/** Format proxy/outgoing duration stored in seconds (e.g. 1.23). */
export function formatLogDurationSeconds(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds === 0) return '0s';
  const rounded = Math.round(seconds * 100) / 100;
  return `${rounded}s`;
}

/** Match an audit line to the closest outgoing bridge call (bulk actions share one duration). */
export function findOutgoingDurationForAudit(
  outgoing: OutgoingLogDurationRow[],
  kind: 'plugin' | 'theme',
  action: string,
  atMs: number,
): number | undefined {
  const want = manageEndpointKey(kind, action);
  let best: { duration: number; delta: number } | undefined;

  for (const row of outgoing) {
    if (typeof row.duration !== 'number') continue;
    if (normalizeManageEndpoint(row.endpoint ?? '') !== want) continue;

    const rowMs = logTimeMs(row.time);
    if (rowMs <= 0 || atMs <= 0) continue;

    const delta = Math.abs(rowMs - atMs);
    if (delta > 120_000) continue;

    if (!best || delta < best.delta) {
      best = { duration: row.duration, delta };
    }
  }

  return best?.duration;
}

function countResultsOkFailed(results: unknown[]): { ok: number; failed: number } {
  let ok = 0;
  let failed = 0;
  for (const item of results) {
    if (!item || typeof item !== 'object') {
      failed += 1;
      continue;
    }
    if ((item as { ok?: boolean }).ok === true) ok += 1;
    else failed += 1;
  }
  return { ok, failed };
}

/** Short display label from plugin file path or theme slug. */
export function itemDisplayLabel(id: string): string {
  const norm = id.replace(/\\/g, '/').trim();
  if (!norm) return '—';
  const parts = norm.split('/').filter(Boolean);
  const first = parts[0] ?? norm;
  return first.replace(/\.php$/i, '') || norm;
}

function mapResultItems(results: unknown[]): BulkResultItem[] {
  const items: BulkResultItem[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { id?: unknown; ok?: unknown };
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id) continue;
    items.push({
      id,
      label: itemDisplayLabel(id),
      ok: row.ok === true,
    });
  }
  return items;
}

function statusFromCounts(failCount: number, okCount: number): BulkLogStatusInfo {
  if (failCount === 0 && okCount === 0) {
    return { status: 'unknown', label: '—' };
  }
  if (failCount === 0) {
    return { status: 'success', label: 'Succeeded' };
  }
  if (okCount === 0) {
    return { status: 'failure', label: 'Failed' };
  }
  return {
    status: 'partial',
    label: `${okCount} ok, ${failCount} failed`,
  };
}

/** Parse bridge bulk response JSON (results / succeeded / failed). */
export function parseBulkLogResponse(response?: string): ParsedBulkLogResponse {
  const unknown: ParsedBulkLogResponse = {
    status: { status: 'unknown', label: '—' },
    items: [],
  };
  if (!response?.trim()) return unknown;

  try {
    const parsed: unknown = JSON.parse(response);
    if (!parsed || typeof parsed !== 'object') return unknown;
    const body = parsed as {
      failed?: number;
      succeeded?: number;
      results?: unknown[];
    };

    const items = Array.isArray(body.results) ? mapResultItems(body.results) : [];

    let failed = typeof body.failed === 'number' ? body.failed : null;
    let succeeded = typeof body.succeeded === 'number' ? body.succeeded : null;

    if ((failed === null || succeeded === null) && items.length > 0) {
      const counts = countResultsOkFailed(body.results ?? []);
      if (failed === null) failed = counts.failed;
      if (succeeded === null) succeeded = counts.ok;
    }

    if (failed === null && succeeded === null) {
      return items.length > 0
        ? {
            status: statusFromCounts(
              items.filter((i) => !i.ok).length,
              items.filter((i) => i.ok).length,
            ),
            items,
          }
        : unknown;
    }

    return {
      status: statusFromCounts(failed ?? 0, succeeded ?? 0),
      items,
    };
  } catch {
    return unknown;
  }
}

/** Derive row status from bridge bulk response JSON (results / succeeded / failed). */
export function bulkStatusFromResponse(response?: string): BulkLogStatusInfo {
  return parseBulkLogResponse(response).status;
}

/** Single action-log row status (no partial state). */
export function actionLogRowStatus(failed: boolean): BulkLogStatusInfo {
  return failed
    ? { status: 'failure', label: 'Failed' }
    : { status: 'success', label: 'OK' };
}

/** One action-log row as a single item chip. */
export function actionLogResultItem(label: string, failed: boolean): BulkResultItem {
  return {
    id: label,
    label: label || '—',
    ok: !failed,
  };
}
