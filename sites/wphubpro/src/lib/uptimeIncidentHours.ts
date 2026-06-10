import type { Site } from '@/types';

export const UPTIME_BAR_COUNT = 24;

const MS_PER_DAY = 86_400_000;

export type HourBucket = {
  startMs: number;
  endMs: number;
};

function parseTimeMs(pick: unknown): number | null {
  if (pick == null) return null;
  const s = String(pick).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** Start of incident (UptimeRobot v3 / legacy field names). */
export function incidentStartedMs(inc: Record<string, unknown>): number {
  const t =
    parseTimeMs(inc.startedAt) ??
    parseTimeMs(inc.started_at) ??
    parseTimeMs(inc.createdAt) ??
    parseTimeMs(inc.created_at) ??
    parseTimeMs(inc.date) ??
    parseTimeMs(inc.time);
  return t ?? 0;
}

function incidentHasKnownStart(inc: Record<string, unknown>): boolean {
  return (
    parseTimeMs(inc.startedAt) != null ||
    parseTimeMs(inc.started_at) != null ||
    parseTimeMs(inc.createdAt) != null ||
    parseTimeMs(inc.created_at) != null ||
    parseTimeMs(inc.date) != null ||
    parseTimeMs(inc.time) != null
  );
}

/** End of incident; ongoing incidents use `nowMs`. */
export function incidentEndedMs(inc: Record<string, unknown>, nowMs: number): number {
  const resolved =
    parseTimeMs(inc.resolvedAt) ??
    parseTimeMs(inc.resolved_at) ??
    parseTimeMs(inc.endedAt) ??
    parseTimeMs(inc.ended_at);
  if (resolved != null && resolved >= incidentStartedMs(inc)) return resolved;
  return nowMs;
}

export function normalizeMonitorId(id: string | undefined | null): string {
  if (id == null) return '';
  const t = String(id).trim();
  if (!t) return '';
  const n = Number(t);
  if (Number.isFinite(n) && String(n) === t) return String(n);
  return t;
}

export function incidentMonitorId(inc: Record<string, unknown>): string {
  const mid = inc._monitorId;
  return typeof mid === 'string' ? normalizeMonitorId(mid) : '';
}

/**
 * 24 local calendar-hour windows, oldest first (index 0 ≈ 23h ago, index 23 = current hour).
 */
export function buildLast24HourBuckets(now: Date = new Date()): HourBucket[] {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  const h = now.getHours();
  const currentHourStart = new Date(y, mo, d, h, 0, 0, 0).getTime();
  const buckets: HourBucket[] = [];
  for (let i = 0; i < UPTIME_BAR_COUNT; i++) {
    const startMs = currentHourStart - (UPTIME_BAR_COUNT - 1 - i) * 3600_000;
    const endMs = startMs + 3600_000;
    buckets.push({ startMs, endMs });
  }
  return buckets;
}

export function hourBucketOverlapsIncident(bucket: HourBucket, incidentStartMs: number, incidentEndMs: number): boolean {
  return incidentStartMs < bucket.endMs && incidentEndMs > bucket.startMs;
}

export function emptyUptimeBars(): boolean[] {
  return Array.from({ length: UPTIME_BAR_COUNT }, () => false);
}

/**
 * One merged bar row for a set of incidents (any monitor); used after filtering to one monitor.
 */
export function buildUptimeBarsForIncidents(incidents: readonly Record<string, unknown>[], now: Date = new Date()): boolean[] {
  const bars = emptyUptimeBars();
  const buckets = buildLast24HourBuckets(now);
  const nowMs = now.getTime();
  for (const inc of incidents) {
    const s = incidentStartedMs(inc);
    const e = incidentEndedMs(inc, nowMs);
    if (e <= s) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (hourBucketOverlapsIncident(buckets[i], s, e)) bars[i] = true;
    }
  }
  return bars;
}

/**
 * Incidents overlapping the 24 local calendar hours used by {@link buildUptimeBarsForIncidents},
 * plus merged downtime within that window.
 */
export type Last24HourBarWindowStats = {
  incidentCount: number;
  downtimeMs: number;
  /** 0–100, one decimal; from merged downtime vs the same 24 local-hour window as the bars. */
  uptimePercent: number;
};

export function last24HourBarWindowStats(
  incidents: readonly Record<string, unknown>[],
  now: Date = new Date(),
): Last24HourBarWindowStats {
  const buckets = buildLast24HourBuckets(now);
  if (buckets.length === 0) return { incidentCount: 0, downtimeMs: 0, uptimePercent: 100 };
  const rangeStart = buckets[0].startMs;
  const rangeEnd = buckets[buckets.length - 1].endMs;
  const nowMs = now.getTime();

  let incidentCount = 0;
  const clipped: [number, number][] = [];

  for (const inc of incidents) {
    const s = incidentStartedMs(inc);
    const e = incidentEndedMs(inc, nowMs);
    if (e <= s) continue;
    if (e <= rangeStart || s >= rangeEnd) continue;
    incidentCount += 1;
    const clipS = Math.max(s, rangeStart);
    const clipE = Math.min(e, rangeEnd);
    if (clipE > clipS) clipped.push([clipS, clipE]);
  }

  clipped.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of clipped) {
    if (!merged.length || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      const tail = merged[merged.length - 1];
      tail[1] = Math.max(tail[1], e);
    }
  }

  let downtimeMs = 0;
  for (const [s, e] of merged) {
    downtimeMs += e - s;
  }

  const windowMs = Math.max(0, rangeEnd - rangeStart);
  const uptimeMs = Math.max(0, windowMs - downtimeMs);
  let uptimePercent = windowMs > 0 ? (uptimeMs / windowMs) * 100 : 100;
  if (!Number.isFinite(uptimePercent)) uptimePercent = 100;
  uptimePercent = Math.min(100, Math.max(0, uptimePercent));
  uptimePercent = Math.round(uptimePercent * 10) / 10;

  return { incidentCount, downtimeMs, uptimePercent };
}

export function buildMonitorIdToSiteIdMap(sites: readonly Site[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const site of sites) {
    const mid = normalizeMonitorId(site.urMonitorId);
    if (mid) map.set(mid, site.$id);
  }
  return map;
}

export function buildSiteUptimeBarsBySiteId(
  sites: readonly Site[],
  incidents: readonly Record<string, unknown>[],
  now: Date = new Date(),
): Map<string, boolean[]> {
  const bySite = new Map<string, boolean[]>();
  for (const site of sites) {
    bySite.set(site.$id, emptyUptimeBars());
  }
  const nowMs = now.getTime();
  const buckets = buildLast24HourBuckets(now);
  const monitorToSite = buildMonitorIdToSiteIdMap(sites);
  for (const inc of incidents) {
    const mid = incidentMonitorId(inc);
    if (!mid) continue;
    const siteId = monitorToSite.get(mid);
    if (!siteId) continue;
    const s = incidentStartedMs(inc);
    const e = incidentEndedMs(inc, nowMs);
    if (e <= s) continue;
    const row = bySite.get(siteId);
    if (!row) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (hourBucketOverlapsIncident(buckets[i], s, e)) row[i] = true;
    }
  }
  return bySite;
}

export type UptimeWindowStats = {
  /** 0–100, one decimal. */
  uptimePercent: number;
  /** Incidents overlapping the rolling window (same rows as listed when from API). */
  incidentCount: number;
  downtimeMs: number;
  windowMs: number;
};

/**
 * Rolling-window uptime from incident intervals (merged overlaps).
 * Incidents without a parseable start time are ignored for downtime.
 */
export function uptimeWindowStatsFromIncidents(
  incidents: readonly Record<string, unknown>[],
  windowDays: number,
  now: Date = new Date(),
): UptimeWindowStats {
  const nowMs = now.getTime();
  const windowMs = Math.max(0, windowDays * MS_PER_DAY);
  const windowStart = nowMs - windowMs;

  const clipped: [number, number][] = [];
  let incidentCount = 0;

  for (const inc of incidents) {
    const s = incidentStartedMs(inc);
    const e = incidentEndedMs(inc, nowMs);
    if (e <= s) continue;
    if (e <= windowStart || s >= nowMs) continue;
    incidentCount += 1;
    if (!incidentHasKnownStart(inc)) continue;
    const clipS = Math.max(s, windowStart);
    const clipE = Math.min(e, nowMs);
    if (clipE > clipS) clipped.push([clipS, clipE]);
  }

  clipped.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of clipped) {
    if (!merged.length || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      const tail = merged[merged.length - 1];
      tail[1] = Math.max(tail[1], e);
    }
  }

  let downtimeMs = 0;
  for (const [s, e] of merged) {
    downtimeMs += e - s;
  }

  const uptimeMs = Math.max(0, windowMs - downtimeMs);
  let uptimePercent = windowMs > 0 ? (uptimeMs / windowMs) * 100 : 100;
  if (!Number.isFinite(uptimePercent)) uptimePercent = 100;
  uptimePercent = Math.min(100, Math.max(0, uptimePercent));
  uptimePercent = Math.round(uptimePercent * 10) / 10;

  return { uptimePercent, incidentCount, downtimeMs, windowMs };
}
