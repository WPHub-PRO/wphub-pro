import { parseActionLogForAudit, useSiteUptimeMonitor } from '@/domains/sites';
import {
  actionLogResultItem,
  actionLogRowStatus,
  findOutgoingDurationForAudit,
  formatLogDurationSeconds,
  parseBulkLogResponse,
  type BulkLogRowStatus,
  type BulkResultItem,
} from '@/domains/sites/logRowStatus';
import {
  buildUptimeBarsForIncidents,
  last24HourBarWindowStats,
  uptimeWindowStatsFromIncidents,
} from '@/lib/uptimeIncidentHours';
import { formatDurationMonthsDaysHours } from '@/lib/uptimeIncidentDisplay';
import { urMonitorStatusDisplay } from '@/lib/uptimeMonitorStatus';
import { getChecksForDashboard, parseSiteHealthMeta, severityTotalsForChecks } from '@/lib/parseSiteHealthMeta';
import type { Site, SiteHealthSeverity } from '@/types';
import SiteUptimeBars from '@/components/sites/SiteUptimeBars';
import UptimeIncidentsTable from '@/components/sites/UptimeIncidentsTable';
import { SiteHealthAiAgentModal } from '@/views/sites/detail/SiteHealthAiAgentModal';
import SiteHealthMetaPanel from '@/views/sites/detail/SiteHealthMetaPanel';
import { formatChecked, formatSiteHealthCheckedOn } from '@/views/sites/detail/siteDetailFormat';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Button, Card, CardBody, Col, Form, Nav, Row, Spinner, Tab, Table } from 'react-bootstrap';
import { TbAlertTriangle, TbCircleCheck, TbCircleX, TbSparkles } from 'react-icons/tb';
import { useSearchParams } from 'react-router';

export { formatChecked } from '@/views/sites/detail/siteDetailFormat';

type OutgoingLogRow = NonNullable<Site['logData']>['outgoing'][number];

function logTimeMs(time: string | undefined): number {
  if (!time) return 0;
  const ms = Date.parse(time);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Newest log entries first (for SiteDetail → Logs tables). */
function sortLogRowsNewestFirst<T extends { time?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => logTimeMs(b.time) - logTimeMs(a.time));
}

function parseOutgoingLogDisplay(endpoint: string): { type: string; action: string } {
  const path = endpoint.trim().toLowerCase();
  const manageMatch = path.match(/\/(plugins|themes)\/manage\/([^/?]+)/);
  if (manageMatch) {
    return {
      type: manageMatch[1] === 'themes' ? 'theme' : 'plugin',
      action: manageMatch[2],
    };
  }
  if (path.includes('/themes/')) {
    const segment = path.split('/').filter(Boolean).pop();
    return { type: 'theme', action: segment ?? '—' };
  }
  if (path.includes('/plugins/')) {
    const segment = path.split('/').filter(Boolean).pop();
    return { type: 'plugin', action: segment ?? '—' };
  }
  return { type: '—', action: endpoint || '—' };
}

function LogStatusCell({ status, label }: { status: BulkLogRowStatus; label: string }) {
  const icon =
    status === 'success' ? (
      <TbCircleCheck className="text-success flex-shrink-0" size={16} aria-hidden />
    ) : status === 'partial' ? (
      <TbAlertTriangle className="text-warning flex-shrink-0" size={16} aria-hidden />
    ) : status === 'failure' ? (
      <TbCircleX className="text-danger flex-shrink-0" size={16} aria-hidden />
    ) : null;

  if (status === 'success') {
    return (
      <span className="d-inline-flex align-items-center justify-content-end" aria-label={label} title={label}>
        {icon}
      </span>
    );
  }

  if (status === 'partial') {
    return (
      <span className="d-inline-flex align-items-center justify-content-end gap-1">
        <span>{label}</span>
        {icon}
      </span>
    );
  }

  return (
    <span className="d-inline-flex align-items-center justify-content-end gap-1">
      {icon}
      <span>{label}</span>
    </span>
  );
}

function LogItemsCell({ items }: { items: BulkResultItem[] }) {
  if (items.length === 0) {
    return <span className="text-muted fs-xs">—</span>;
  }

  return (
    <div className="d-flex flex-wrap align-items-center gap-1">
      {items.map((item, index) => (
        <span
          key={`${item.id}-${index}`}
          className={`badge fs-xxs ${item.ok ? 'badge-soft-success' : 'badge-soft-danger'}`}
          title={item.id}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

const LOG_STATUS_ORDER: BulkLogRowStatus[] = ['failure', 'partial', 'success', 'unknown'];

const FILTER_CHIP_ACTIVE_CLASS = 'border border-secondary-subtle rounded';

function logStatusSoftClass(status: BulkLogRowStatus): string {
  switch (status) {
    case 'success':
      return 'badge-soft-success';
    case 'partial':
      return 'badge-soft-warning';
    case 'failure':
      return 'badge-soft-danger';
    default:
      return 'badge-soft-secondary';
  }
}

function logStatusDisplayName(status: BulkLogRowStatus): string {
  switch (status) {
    case 'success':
      return 'Succeeded';
    case 'partial':
      return 'Partial';
    case 'failure':
      return 'Failed';
    default:
      return 'Unknown';
  }
}

function logTypeDisplayName(type: string): string {
  if (type === 'plugin' || type === 'theme') return type;
  return type || '—';
}

type LogFilterDimensions = {
  type: string;
  action: string;
  status: BulkLogRowStatus;
};

function matchesLogFilters(
  row: LogFilterDimensions,
  statusFilters: Set<BulkLogRowStatus>,
  typeFilter: string | null,
  actionFilter: string | null,
): boolean {
  if (statusFilters.size > 0 && !statusFilters.has(row.status)) return false;
  if (typeFilter != null && row.type !== typeFilter) return false;
  if (actionFilter != null && row.action !== actionFilter) return false;
  return true;
}

type FilterStatusBadgeProps = {
  status: BulkLogRowStatus;
  count: number;
  active: boolean;
  onToggle: (status: BulkLogRowStatus) => void;
};

function FilterStatusBadge({ status, count, active, onToggle }: FilterStatusBadgeProps) {
  const label = logStatusDisplayName(status);
  const disabled = count <= 0;
  return (
    <button
      type="button"
      className={`badge ${logStatusSoftClass(status)} ${active ? FILTER_CHIP_ACTIVE_CLASS : 'border-0'}`}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      disabled={disabled}
      aria-pressed={active}
      aria-label={
        disabled
          ? `${label}: no entries`
          : active
            ? `${label}: remove from filter`
            : `Add ${label} to filter`
      }
      onClick={() => onToggle(status)}
    >
      {label} {count}
    </button>
  );
}

type SiteLogsFiltersProps = {
  entries: LogFilterDimensions[];
  statusFilters: Set<BulkLogRowStatus>;
  setStatusFilters: Dispatch<SetStateAction<Set<BulkLogRowStatus>>>;
  typeFilter: string | null;
  setTypeFilter: Dispatch<SetStateAction<string | null>>;
  actionFilter: string | null;
  setActionFilter: Dispatch<SetStateAction<string | null>>;
};

function SiteLogsFilters({
  entries,
  statusFilters,
  setStatusFilters,
  typeFilter,
  setTypeFilter,
  actionFilter,
  setActionFilter,
}: SiteLogsFiltersProps) {
  const statusTotals = useMemo(() => {
    const totals: Record<BulkLogRowStatus, number> = {
      success: 0,
      partial: 0,
      failure: 0,
      unknown: 0,
    };
    for (const entry of entries) {
      totals[entry.status] += 1;
    }
    return totals;
  }, [entries]);

  const afterStatus = useMemo(() => {
    if (statusFilters.size === 0) return entries;
    return entries.filter((e) => statusFilters.has(e.status));
  }, [entries, statusFilters]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of afterStatus) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [afterStatus]);

  const afterType = useMemo(() => {
    if (typeFilter == null) return afterStatus;
    return afterStatus.filter((e) => e.type === typeFilter);
  }, [afterStatus, typeFilter]);

  const actionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of afterType) {
      counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [afterType]);

  useEffect(() => {
    const validTypes = new Set(typeOptions.map(([t]) => t));
    setTypeFilter((prev) => (prev != null && !validTypes.has(prev) ? null : prev));
  }, [typeOptions, setTypeFilter]);

  useEffect(() => {
    const validActions = new Set(actionOptions.map(([a]) => a));
    setActionFilter((prev) => (prev != null && !validActions.has(prev) ? null : prev));
  }, [actionOptions, setActionFilter]);

  const hasActiveStatusFilter = statusFilters.size > 0;
  const hasActiveTypeFilter = typeFilter != null;
  const hasActiveActionFilter = actionFilter != null;
  const hasAnyFilter = hasActiveStatusFilter || hasActiveTypeFilter || hasActiveActionFilter;

  const toggleStatusFilter = (status: BulkLogRowStatus) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const clearStatusFilters = () => setStatusFilters(new Set());

  const clearAllFilters = () => {
    setStatusFilters(new Set());
    setTypeFilter(null);
    setActionFilter(null);
  };

  return (
    <div className="border-bottom border-secondary-subtle pb-3">
      <div className="d-flex flex-wrap align-items-center column-gap-3 row-gap-2 w-100">
        <div
          className="d-flex flex-wrap align-items-center gap-2 flex-grow-1 min-w-0"
          role="group"
          aria-label="By status"
        >
          <span className="text-muted fs-sm flex-shrink-0 align-self-center">Filter by Status</span>
          <div className="d-flex flex-wrap align-items-center gap-2 min-w-0">
            {LOG_STATUS_ORDER.map((status) => (
              <FilterStatusBadge
                key={status}
                status={status}
                count={statusTotals[status]}
                active={statusFilters.has(status)}
                onToggle={toggleStatusFilter}
              />
            ))}
            <button
              type="button"
              className={`badge badge-soft-secondary ${!hasActiveStatusFilter ? FILTER_CHIP_ACTIVE_CLASS : 'border-0'}`}
              style={{ cursor: 'pointer' }}
              aria-pressed={!hasActiveStatusFilter}
              aria-label={`Show all log entries (${entries.length} total)`}
              onClick={clearStatusFilters}
            >
              All ({entries.length})
            </button>
          </div>
          {hasActiveStatusFilter ? (
            <Button variant="outline-secondary" size="sm" className="flex-shrink-0" onClick={clearStatusFilters}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="d-flex flex-nowrap align-items-center gap-2 flex-shrink-0">
          <Form.Label
            htmlFor="site-logs-type-filter"
            className="text-muted fs-sm mb-0 flex-shrink-0 align-self-center text-nowrap"
          >
            Type
          </Form.Label>
          <Form.Select
            id="site-logs-type-filter"
            size="sm"
            value={typeFilter ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setTypeFilter(v === '' ? null : v);
            }}
            aria-label="Filter by type"
            className="w-auto"
            style={{ minWidth: '10rem', maxWidth: '18rem' }}
          >
            <option value="">All types</option>
            {typeOptions.map(([type, count]) => (
              <option key={type} value={type} disabled={count === 0}>
                {logTypeDisplayName(type)} ({count})
              </option>
            ))}
          </Form.Select>
        </div>

        <div className="d-flex flex-nowrap align-items-center gap-2 flex-shrink-0">
          <Form.Label
            htmlFor="site-logs-action-filter"
            className="text-muted fs-sm mb-0 flex-shrink-0 align-self-center text-nowrap"
          >
            Action
          </Form.Label>
          <Form.Select
            id="site-logs-action-filter"
            size="sm"
            value={actionFilter ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              setActionFilter(v === '' ? null : v);
            }}
            aria-label="Filter by action"
            className="w-auto"
            style={{ minWidth: '10rem', maxWidth: '18rem' }}
          >
            <option value="">All actions</option>
            {actionOptions.map(([action, count]) => (
              <option key={action} value={action} disabled={count === 0}>
                {action} ({count})
              </option>
            ))}
          </Form.Select>
        </div>

        {hasAnyFilter ? (
          <Button variant="outline-secondary" size="sm" className="flex-shrink-0 ms-auto" onClick={clearAllFilters}>
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
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
  const st = urMonitorStatusDisplay(mon.status);
  const stateDurationSec =
    typeof mon.currentStateDuration === 'number' && Number.isFinite(mon.currentStateDuration)
      ? mon.currentStateDuration
      : null;

  const n24 = last24BarWindow.incidentCount;
  const last24IncidentPart = n24 === 1 ? '1 incident' : `${n24} incidents`;
  const last24BarSummaryLine = `${last24IncidentPart}, ${formatDowntimeHmsCommaSeparated(last24BarWindow.downtimeMs)} down`;

  return (
    <>
      <Row className="g-3 align-items-stretch">
        <Col xs={12} lg={4}>
          <Card className="h-100">
            <CardBody className="d-flex flex-column">
              <h6 className="fs-base mb-3">Current Status</h6>
              <div className="d-flex align-items-center gap-2 mb-2">
                {st.variant === 'success' || st.variant === 'danger' || st.variant === 'warning' ? (
                  <span
                    className={`site-uptime-dot ${st.variant === 'success' ? 'site-uptime-dot--up' : 'site-uptime-dot--down'}`}
                    aria-hidden
                  />
                ) : null}
                <span className={`fs-2 fw-semibold text-${st.variant}`}>{st.label}</span>
              </div>
              {stateDurationSec != null ? (
                <p className="fs-sm text-muted mb-0">
                  In this state for {formatDurationMonthsDaysHours(stateDurationSec * 1000)}
                </p>
              ) : typeof mon.interval === 'number' ? (
                <p className="fs-xs text-muted mb-0">Check interval: {mon.interval}s</p>
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
              <div className="site-uptime-bars-block">
                <div className="d-flex justify-content-between align-items-baseline gap-2 mb-3 flex-wrap">
                  <h6 className="fs-base mb-0">Last 24 hours</h6>
                  <span className="fs-4 fw-semibold text-body text-nowrap mb-0">
                    {last24BarWindow.uptimePercent.toFixed(1)}%
                  </span>
                </div>
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
          <UptimeIncidentsTable incidents={incidents as Record<string, unknown>[]} />
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
  const outgoing = useMemo(
    () => sortLogRowsNewestFirst(site.logData?.outgoing ?? []),
    [site.logData?.outgoing],
  );
  const incoming = useMemo(
    () => sortLogRowsNewestFirst(site.logData?.incoming ?? []),
    [site.logData?.incoming],
  );
  const auditLines = useMemo(() => parseActionLogForAudit(site.actionLog), [site.actionLog]);

  const [statusFilters, setStatusFilters] = useState<Set<BulkLogRowStatus>>(() => new Set());
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);

  useEffect(() => {
    setStatusFilters(new Set());
    setTypeFilter(null);
    setActionFilter(null);
  }, [site.$id, site.logData, site.actionLog]);

  const filterableEntries = useMemo((): LogFilterDimensions[] => {
    const entries: LogFilterDimensions[] = [];
    for (const row of outgoing) {
      const { type, action } = parseOutgoingLogDisplay(row.endpoint);
      const parsed = parseBulkLogResponse(row.response);
      entries.push({ type, action, status: parsed.status.status });
    }
    for (const line of auditLines) {
      const statusInfo = actionLogRowStatus(line.failed);
      entries.push({ type: line.kind, action: line.action, status: statusInfo.status });
    }
    return entries;
  }, [outgoing, auditLines]);

  const filteredOutgoing = useMemo(() => {
    return outgoing.filter((row) => {
      const { type, action } = parseOutgoingLogDisplay(row.endpoint);
      const parsed = parseBulkLogResponse(row.response);
      return matchesLogFilters(
        { type, action, status: parsed.status.status },
        statusFilters,
        typeFilter,
        actionFilter,
      );
    });
  }, [outgoing, statusFilters, typeFilter, actionFilter]);

  const filteredAuditLines = useMemo(() => {
    return auditLines.filter((line) => {
      const statusInfo = actionLogRowStatus(line.failed);
      return matchesLogFilters(
        { type: line.kind, action: line.action, status: statusInfo.status },
        statusFilters,
        typeFilter,
        actionFilter,
      );
    });
  }, [auditLines, statusFilters, typeFilter, actionFilter]);

  const filteredIncoming = useMemo(() => {
    if (typeFilter == null) return incoming;
    return incoming.filter((row) => (row as { type?: string }).type === typeFilter);
  }, [incoming, typeFilter]);

  const hasActiveFilters =
    statusFilters.size > 0 || typeFilter != null || actionFilter != null;
  const noFilterMatches =
    hasActiveFilters && filteredOutgoing.length === 0 && filteredAuditLines.length === 0;

  return (
    <div className="d-flex flex-column gap-3">
      {filterableEntries.length > 0 ? (
        <SiteLogsFilters
          entries={filterableEntries}
          statusFilters={statusFilters}
          setStatusFilters={setStatusFilters}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          actionFilter={actionFilter}
          setActionFilter={setActionFilter}
        />
      ) : null}

      {noFilterMatches ? <p className="text-muted mb-0">No log entries match this filter.</p> : null}

      {filteredOutgoing.length > 0 && (
        <Card>
          <CardBody>
            <h5 className="fs-base mb-3">Bridge / proxy (outgoing)</h5>
            <div className="table-responsive border rounded">
              <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
                <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                  <tr className="text-uppercase fs-xxs">
                    <th>Time</th>
                    <th>Duration</th>
                    <th>Type</th>
                    <th>Action</th>
                    <th>Items</th>
                    <th className="text-end">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOutgoing.map((row: OutgoingLogRow, i: number) => {
                    const { type, action } = parseOutgoingLogDisplay(row.endpoint);
                    const parsed = parseBulkLogResponse(row.response);
                    return (
                    <tr key={`${row.time}-${i}`}>
                      <td className="text-muted fs-xs text-nowrap">{formatChecked(row.time)}</td>
                      <td className="text-muted fs-xs text-nowrap font-monospace">
                        {formatLogDurationSeconds(row.duration)}
                      </td>
                      <td className="fs-xs">{type}</td>
                      <td className="fs-xs text-break">{action}</td>
                      <td className="fs-xs">
                        <LogItemsCell items={parsed.items} />
                      </td>
                      <td className="text-end fs-xs">
                        <LogStatusCell status={parsed.status.status} label={parsed.status.label} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </CardBody>
        </Card>
      )}

      {filteredIncoming.length > 0 && (
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
                  {filteredIncoming.map((row, i) => (
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
          {auditLines.length === 0 ? (
            <p className="text-muted mb-0 fs-xs">No plugin or theme actions recorded.</p>
          ) : filteredAuditLines.length === 0 && hasActiveFilters ? null : (
            <div className="table-responsive border rounded">
              <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
                <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                  <tr className="text-uppercase fs-xxs">
                    <th>Time</th>
                    <th>Duration</th>
                    <th>Type</th>
                    <th>Action</th>
                    <th>Items</th>
                    <th className="text-end">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLines.map((line) => {
                    const statusInfo = actionLogRowStatus(line.failed);
                    const items = [actionLogResultItem(line.extensionName, line.failed)];
                    const durationSec = findOutgoingDurationForAudit(
                      outgoing,
                      line.kind,
                      line.action,
                      line.atMs,
                    );
                    return (
                    <tr key={line.id}>
                      <td className="text-muted fs-xs text-nowrap">{line.dateTime}</td>
                      <td className="text-muted fs-xs text-nowrap font-monospace">
                        {formatLogDurationSeconds(durationSec)}
                      </td>
                      <td className="fs-xs">{line.kind}</td>
                      <td className="fs-xs">{line.action}</td>
                      <td className="fs-xs">
                        <LogItemsCell items={items} />
                      </td>
                      <td className="text-end fs-xs">
                        <LogStatusCell status={statusInfo.status} label={statusInfo.label} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
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
