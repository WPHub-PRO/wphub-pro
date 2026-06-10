import { parseActionLogForAudit, useSiteUptimeMonitor } from '@/domains/sites';
import {
  buildUptimeBarsForIncidents,
  incidentEndedMs,
  incidentStartedMs,
  last24HourBarWindowStats,
  uptimeWindowStatsFromIncidents,
} from '@/lib/uptimeIncidentHours';
import { getChecksForDashboard, parseSiteHealthMeta, severityTotalsForChecks } from '@/lib/parseSiteHealthMeta';
import type { Site, SiteHealthSeverity } from '@/types';
import SiteUptimeBars from '@/components/sites/SiteUptimeBars';
import SiteActionHistoryList from '@/views/sites/detail/SiteActionHistoryList';
import { SiteHealthAiAgentModal } from '@/views/sites/detail/SiteHealthAiAgentModal';
import SiteHealthMetaPanel from '@/views/sites/detail/SiteHealthMetaPanel';
import { formatChecked, formatSiteHealthCheckedOn } from '@/views/sites/detail/siteDetailFormat';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, CardBody, Col, Nav, Row, Spinner, Tab, Table } from 'react-bootstrap';
import { TbSparkles } from 'react-icons/tb';
import { useSearchParams } from 'react-router';

export { formatChecked } from '@/views/sites/detail/siteDetailFormat';

type OutgoingLogRow = NonNullable<Site['logData']>['outgoing'][number];

function incidentIso(row: Record<string, unknown>): string | undefined {
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
function incidentStatusLabel(row: Record<string, unknown>): string {
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

function incidentRootCause(row: Record<string, unknown>): string {
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
function splitRootCauseAndStatusCode(raw: string): { code: string | null; rest: string } {
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

function formatDurationMs(ms: number): string {
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

/** e.g. `18h, 12m, 29s` — omits zero units except `0s` when there is no downtime. */
function formatDowntimeHmsCommaSeparated(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms === 0) return '0s';
  let sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(', ');
}

function incidentDurationDisplay(row: Record<string, unknown>): string {
  const nowMs = Date.now();
  const s = incidentStartedMs(row);
  const e = incidentEndedMs(row, nowMs);
  if (s <= 0 || e <= s) return '—';
  return formatDurationMs(e - s);
}

function incidentStatusBadgeVariant(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('resolved') || l.includes('closed') || l.includes('complete')) return 'success';
  if (l.includes('ongoing') || l.includes('active') || l.includes('started') || l.includes('open')) return 'warning';
  return 'secondary';
}

function urMonitorStatusBadge(status: unknown): { label: string; variant: string } {
  const n = Number(status);
  if (n === 2) return { label: 'Up', variant: 'success' };
  if (n === 9) return { label: 'Down', variant: 'danger' };
  if (n === 8) return { label: 'Seems down', variant: 'warning' };
  if (n === 0) return { label: 'Paused', variant: 'secondary' };
  return { label: 'Unknown', variant: 'secondary' };
}

function SiteMonitorSubpanel({ site }: { site: Site }) {
  const { data, isLoading, isError, error } = useSiteUptimeMonitor(site.$id);
  const incidents = data?.incidents ?? [];
  const uptimeBars = useMemo(
    () => buildUptimeBarsForIncidents(incidents as Record<string, unknown>[]),
    [incidents],
  );
  const last30Stats = useMemo(
    () => uptimeWindowStatsFromIncidents(incidents as Record<string, unknown>[], 30),
    [incidents],
  );
  const last24BarWindow = useMemo(
    () => last24HourBarWindowStats(incidents as Record<string, unknown>[]),
    [incidents],
  );

  if (isLoading) {
    return (
      <div className="d-flex align-items-center gap-2 text-muted" role="status">
        <Spinner animation="border" size="sm" />
        <span className="fs-sm">Loading UptimeRobot monitor…</span>
      </div>
    );
  }

  if (isError) {
    return <p className="text-danger fs-sm mb-0">{error?.message ?? 'Could not load monitor.'}</p>;
  }

  if (!data?.monitor) {
    return (
      <p className="text-muted fs-sm mb-0">
        {data?.message?.trim() || 'No UptimeRobot monitor linked for this site yet.'}
      </p>
    );
  }

  const mon = data.monitor;
  const title =
    (typeof mon.friendly_name === 'string' && mon.friendly_name.trim()) ||
    (typeof mon.name === 'string' && mon.name.trim()) ||
    'Monitor';
  const url = typeof mon.url === 'string' && mon.url.trim() ? mon.url.trim() : '—';
  const st = urMonitorStatusBadge(mon.status);

  const n24 = last24BarWindow.incidentCount;
  const last24IncidentPart = n24 === 1 ? '1 incident' : `${n24} incidents`;
  const last24BarSummaryLine = `${last24IncidentPart}, ${formatDowntimeHmsCommaSeparated(last24BarWindow.downtimeMs)} down`;

  return (
    <>
      <Row className="g-3 align-items-stretch">
        <Col xs={12} lg={4}>
          <Card className="h-100">
            <CardBody>
              <h6 className="fs-base mb-3">Current Status</h6>
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                <div className="min-w-0">
                  <div className="fs-sm fw-medium mb-1">{title}</div>
                  <div className="fs-xs text-muted text-break">{url}</div>
                </div>
                <span className={`badge badge-soft-${st.variant} text-uppercase fs-xxs`}>{st.label}</span>
              </div>
              {typeof mon.interval === 'number' ? (
                <p className="fs-xs text-muted mb-0">
                  Check interval: {mon.interval}s
                </p>
              ) : null}
            </CardBody>
          </Card>
        </Col>
        <Col xs={12} lg={4}>
          <Card className="h-100">
            <CardBody className="d-flex flex-column">
              <h6 className="fs-base mb-3">Last 30 days</h6>
              <div className="fs-2 fw-semibold mb-1">
                {last30Stats.uptimePercent.toFixed(1)}%{' '}
                <span className="fs-sm fw-normal text-muted">uptime</span>
              </div>
              <p className="fs-sm text-muted mb-0">
                {last30Stats.incidentCount} incident{last30Stats.incidentCount === 1 ? '' : 's'} in the last 30 days
              </p>
            </CardBody>
          </Card>
        </Col>
        <Col xs={12} lg={4}>
          <Card className="h-100">
            <CardBody>
              <div className="d-flex justify-content-between align-items-baseline gap-2 mb-3 flex-wrap">
                <h6 className="fs-base mb-0">Last 24 hours</h6>
                <span className="fs-4 fw-semibold text-body text-nowrap mb-0">
                  {last24BarWindow.uptimePercent.toFixed(1)}%
                </span>
              </div>
              <div className="w-100">
                <SiteUptimeBars bars={uptimeBars} fullWidth className="site-uptime-bars--health-tab" />
              </div>
              <p className="fs-sm text-muted mb-0 mt-3">{last24BarSummaryLine}</p>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mt-3">
        <CardBody>
          <h6 className="fs-base mb-3">Incidents (last 30 days)</h6>
          {incidents.length === 0 ? (
            <p className="text-muted fs-sm mb-0">No incidents recorded in this window.</p>
          ) : (
            <div className="table-responsive border rounded">
              <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
                <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                  <tr className="fs-xxs text-muted">
                    <th scope="col">Status</th>
                    <th scope="col">Root Cause</th>
                    <th scope="col">Started</th>
                    <th scope="col">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((row, i) => {
                    const r = row as Record<string, unknown>;
                    const iso = incidentIso(r);
                    const status = incidentStatusLabel(r);
                    const stVariant = incidentStatusBadgeVariant(status);
                    const root = incidentRootCause(r);
                    const { code, rest } = splitRootCauseAndStatusCode(root);
                    const restText = code ? rest : root;
                    return (
                      <tr key={`inc-${i}-${iso ?? i}`}>
                        <td className="text-nowrap">
                          <span className={`badge badge-soft-${stVariant} text-uppercase fs-xxs`}>{status}</span>
                        </td>
                        <td className="fs-xs">
                          <div className="d-flex flex-wrap align-items-center column-gap-2 row-gap-1">
                            {code ? (
                              <span className="badge badge-soft-danger fs-xxs flex-shrink-0">{code}</span>
                            ) : null}
                            {restText ? <span className="text-break">{restText}</span> : null}
                          </div>
                        </td>
                        <td className="text-muted fs-xs text-nowrap">{formatChecked(iso)}</td>
                        <td className="text-muted fs-xs text-nowrap">{incidentDurationDisplay(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export function SiteDetailHealthPanel({ site }: { site: Site }) {
  const snapshot = useMemo(() => parseSiteHealthMeta(site.healthMeta), [site.healthMeta]);
  const headerChecks = useMemo(() => (snapshot ? getChecksForDashboard(snapshot) : []), [snapshot]);
  const headerTotals = useMemo(() => severityTotalsForChecks(headerChecks), [headerChecks]);
  const criticalCount = headerTotals.critical;
  const warningCount = headerTotals.warning;

  const [searchParams, setSearchParams] = useSearchParams();
  const prevSiteIdRef = useRef<string | null>(null);
  const [severityFilters, setSeverityFilters] = useState<Set<SiteHealthSeverity>>(() => new Set());
  const [healthAiOpen, setHealthAiOpen] = useState(false);
  const [healthAiSession, setHealthAiSession] = useState(0);

  const activeHealthTab: 'monitor' | 'wp' = searchParams.get('healthSub') === 'wp' ? 'wp' : 'monitor';

  useEffect(() => {
    const prev = prevSiteIdRef.current;
    prevSiteIdRef.current = site.$id;
    if (prev !== null && prev !== site.$id) {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.delete('healthSub');
          return n;
        },
        { replace: true },
      );
    }
  }, [site.$id, setSearchParams]);

  useEffect(() => {
    setSeverityFilters(new Set());
  }, [site.$id, site.healthMeta]);

  const titleFilterActive = (sev: 'critical' | 'warning') =>
    severityFilters.size === 1 && severityFilters.has(sev);

  const onTitleSeverityClick = (sev: 'critical' | 'warning') => {
    setSeverityFilters((prev) => {
      if (prev.size === 1 && prev.has(sev)) return new Set();
      return new Set([sev]);
    });
  };

  return (
    <div>
      <h5 className="fs-base mb-3">Health</h5>
      <Tab.Container
        id={`site-health-${site.$id}`}
        activeKey={activeHealthTab}
        onSelect={(k) => {
          if (k !== 'wp' && k !== 'monitor') return;
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (k === 'wp') next.set('healthSub', 'wp');
              else next.delete('healthSub');
              return next;
            },
            { replace: true },
          );
        }}
      >
        <Nav variant="tabs" className="mb-0 flex-nowrap" role="tablist">
          <Nav.Item>
            <Nav.Link eventKey="monitor" role="tab">
              Site Monitor
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="wp" role="tab">
              WP Health
            </Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content>
          <Tab.Pane eventKey="monitor" role="tabpanel">
            <SiteMonitorSubpanel site={site} />
          </Tab.Pane>
          <Tab.Pane eventKey="wp" role="tabpanel">
            <div className="d-flex flex-wrap justify-content-between align-items-start column-gap-3 row-gap-2 mb-3">
              <div className="d-flex flex-wrap align-items-center gap-2 min-w-0">
                <Button
                  type="button"
                  variant="outline-primary"
                  size="sm"
                  className="rounded-circle p-0 d-inline-flex align-items-center justify-content-center"
                  style={{ width: 32, height: 32 }}
                  title="Health assistant — suggested fixes from Site Health"
                  aria-label="Open health assistant"
                  onClick={() => {
                    setHealthAiSession((n) => n + 1);
                    setHealthAiOpen(true);
                  }}
                >
                  <TbSparkles size={18} aria-hidden />
                </Button>
                {criticalCount > 0 ? (
                  <Button
                    type="button"
                    variant={titleFilterActive('critical') ? 'danger' : 'outline-danger'}
                    size="sm"
                    className="text-nowrap"
                    aria-pressed={titleFilterActive('critical')}
                    onClick={() => onTitleSeverityClick('critical')}
                  >
                    Critical ({criticalCount})
                  </Button>
                ) : null}
                {warningCount > 0 ? (
                  <Button
                    type="button"
                    variant={titleFilterActive('warning') ? 'warning' : 'outline-warning'}
                    size="sm"
                    className="text-nowrap"
                    aria-pressed={titleFilterActive('warning')}
                    onClick={() => onTitleSeverityClick('warning')}
                  >
                    Warning ({warningCount})
                  </Button>
                ) : null}
              </div>
              <div className="text-end ms-auto">
                <div className="fs-sm mb-1 text-body">
                  Site Health Checked on: {formatSiteHealthCheckedOn(site.lastChecked)}
                </div>
                <div className="fs-sm d-flex flex-wrap align-items-center justify-content-end gap-1">
                  <span className="text-body">Health Status:</span>
                  <span className={`badge badge-soft-${site.healthStatus === 'healthy' ? 'success' : 'warning'}`}>
                    {site.healthStatus === 'healthy' ? 'Healthy' : 'Needs attention'}
                  </span>
                </div>
              </div>
            </div>
            <SiteHealthMetaPanel site={site} severityFilters={severityFilters} setSeverityFilters={setSeverityFilters} />
            <SiteHealthAiAgentModal
              key={`health-ai-${site.$id}-${healthAiSession}`}
              site={site}
              show={healthAiOpen}
              sessionKey={healthAiSession}
              onHide={() => setHealthAiOpen(false)}
            />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
}

export function SiteDetailLogsPanel({ site }: { site: Site }) {
  const outgoing = site.logData?.outgoing ?? [];
  const incoming = site.logData?.incoming ?? [];
  const auditLines = useMemo(() => parseActionLogForAudit(site.actionLog), [site.actionLog]);

  return (
    <div className="d-flex flex-column gap-3">
      {outgoing.length > 0 && (
        <Card>
          <CardBody>
            <h5 className="fs-base mb-3">Bridge / proxy (outgoing)</h5>
            <div className="table-responsive border rounded">
              <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
                <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                  <tr className="text-uppercase fs-xxs">
                    <th>Time</th>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th className="text-end">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outgoing.map((row: OutgoingLogRow, i: number) => (
                    <tr key={`${row.time}-${i}`}>
                      <td className="text-muted fs-xs text-nowrap">{formatChecked(row.time)}</td>
                      <td className="fs-xs">{row.method}</td>
                      <td className="fs-xs text-break">{row.endpoint}</td>
                      <td className="text-end fs-xs">{row.statusCode}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </CardBody>
        </Card>
      )}

      {incoming.length > 0 && (
        <Card>
          <CardBody>
            <h5 className="fs-base mb-3">Incoming</h5>
            <div className="table-responsive border rounded">
              <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
                <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                  <tr className="text-uppercase fs-xxs">
                    <th>Time</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((row, i) => (
                    <tr key={`in-${i}`}>
                      <td className="text-muted fs-xs">{formatChecked((row as { time?: string }).time)}</td>
                      <td className="fs-xs">{(row as { type?: string }).type ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h5 className="fs-base mb-2">Plugin & theme action history</h5>
          <p className="text-muted fs-xs mb-3">
            Same list as the sidebar — date, extension name, type, and what happened (including failed attempts).
          </p>
          <SiteActionHistoryList
            lines={auditLines}
            emptyText="No plugin or theme actions recorded."
            variant="panel-light"
          />
        </CardBody>
      </Card>

      {outgoing.length === 0 &&
      incoming.length === 0 &&
      (!Array.isArray(site.actionLog) || site.actionLog.length === 0) ? (
        <p className="text-muted mb-0">No log entries for this site.</p>
      ) : null}
    </div>
  );
}
