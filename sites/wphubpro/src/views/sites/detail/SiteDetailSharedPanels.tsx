import { parseActionLogForAudit, useSiteUptimeMonitor } from '@/domains/sites';
import { getChecksForDashboard, parseSiteHealthMeta, severityTotalsForChecks } from '@/lib/parseSiteHealthMeta';
import type { Site, SiteHealthSeverity } from '@/types';
import SiteActionHistoryList from '@/views/sites/detail/SiteActionHistoryList';
import { SiteHealthAiAgentModal } from '@/views/sites/detail/SiteHealthAiAgentModal';
import SiteHealthMetaPanel from '@/views/sites/detail/SiteHealthMetaPanel';
import { formatChecked, formatSiteHealthCheckedOn } from '@/views/sites/detail/siteDetailFormat';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardBody, Nav, Spinner, Tab, Table } from 'react-bootstrap';
import { TbSparkles } from 'react-icons/tb';

export { formatChecked } from '@/views/sites/detail/siteDetailFormat';

type OutgoingLogRow = NonNullable<Site['logData']>['outgoing'][number];

function incidentIso(row: Record<string, unknown>): string | undefined {
  const pick =
    row.startedAt ?? row.started_at ?? row.createdAt ?? row.created_at ?? row.date ?? row.time;
  if (pick == null) return undefined;
  const s = String(pick).trim();
  return s || undefined;
}

function incidentDetailText(row: Record<string, unknown>): string {
  const msg =
    (typeof row.message === 'string' && row.message.trim()) ||
    (typeof row.reason === 'string' && row.reason.trim()) ||
    (typeof row.cause === 'string' && row.cause.trim()) ||
    '';
  return msg || '—';
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
  const incidents = data.incidents ?? [];

  return (
    <div className="d-flex flex-column gap-3">
      <Card>
        <CardBody>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
            <div className="min-w-0">
              <h6 className="fs-base mb-1">{title}</h6>
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

      <div>
        <h6 className="fs-sm text-uppercase text-muted mb-2">Incidents (last 30 days)</h6>
        {incidents.length === 0 ? (
          <p className="text-muted fs-sm mb-0">No incidents recorded in this window.</p>
        ) : (
          <div className="table-responsive border rounded">
            <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
              <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                <tr className="text-uppercase fs-xxs">
                  <th scope="col">Time</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((row, i) => {
                  const r = row as Record<string, unknown>;
                  const iso = incidentIso(r);
                  return (
                    <tr key={`inc-${i}-${iso ?? i}`}>
                      <td className="text-muted fs-xs text-nowrap">{formatChecked(iso)}</td>
                      <td className="fs-xs text-break">{incidentDetailText(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export function SiteDetailHealthPanel({ site }: { site: Site }) {
  const snapshot = useMemo(() => parseSiteHealthMeta(site.healthMeta), [site.healthMeta]);
  const headerChecks = useMemo(() => (snapshot ? getChecksForDashboard(snapshot) : []), [snapshot]);
  const headerTotals = useMemo(() => severityTotalsForChecks(headerChecks), [headerChecks]);
  const criticalCount = headerTotals.critical;
  const warningCount = headerTotals.warning;

  const [severityFilters, setSeverityFilters] = useState<Set<SiteHealthSeverity>>(() => new Set());
  const [healthAiOpen, setHealthAiOpen] = useState(false);
  const [healthAiSession, setHealthAiSession] = useState(0);
  const [healthTab, setHealthTab] = useState<'monitor' | 'wp'>('monitor');

  useEffect(() => {
    setSeverityFilters(new Set());
  }, [site.$id, site.healthMeta]);

  useEffect(() => {
    setHealthTab('monitor');
  }, [site.$id]);

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
        activeKey={healthTab}
        onSelect={(k) => {
          if (k === 'wp' || k === 'monitor') setHealthTab(k);
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
