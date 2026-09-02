import { useSiteUptimeMonitor } from '@/domains/sites';
import SiteUptimeBars from '@/components/sites/SiteUptimeBars';
import { buildUptimeBarsForIncidents, last24HourBarWindowStats } from '@/lib/uptimeIncidentHours';
import type { Site } from '@/types';
import { useMemo } from 'react';
import { Button, Card, CardBody, Spinner } from 'react-bootstrap';

type SiteOverviewHealthCardProps = {
  site: Site;
  onGoHealth: () => void;
};

function urMonitorStatusLabel(status: unknown): string {
  const n = Number(status);
  if (n === 2) return 'Up';
  if (n === 9) return 'Down';
  if (n === 8) return 'Seems down';
  if (n === 0) return 'Paused';
  return 'Unknown';
}

function urMonitorStatusVariant(status: unknown): string {
  const n = Number(status);
  if (n === 2) return 'success';
  if (n === 9) return 'danger';
  if (n === 8) return 'warning';
  return 'secondary';
}

const SiteOverviewHealthCard = ({ site, onGoHealth }: SiteOverviewHealthCardProps) => {
  const healthOk = site.healthStatus === 'healthy';
  const { data, isLoading, isError, error } = useSiteUptimeMonitor(site.$id);
  const incidents = data?.incidents ?? [];
  const uptimeBars = useMemo(
    () => buildUptimeBarsForIncidents(incidents as Record<string, unknown>[]),
    [incidents],
  );
  const last24BarWindow = useMemo(
    () => last24HourBarWindowStats(incidents as Record<string, unknown>[]),
    [incidents],
  );
  const hasMonitor = Boolean(data?.monitor);

  return (
    <Card className="border shadow-none d-flex flex-column flex-shrink-0">
      <CardBody className="d-flex flex-column flex-grow-1">
        <p className="text-muted fs-xs text-uppercase fw-semibold mb-1">Health</p>
        <p className="mb-3">{healthOk ? 'Status: Healthy' : 'Status: Needs attention'}</p>

        <div className="site-uptime-bars-block mb-3">
          <div className="d-flex justify-content-between align-items-baseline gap-2 flex-wrap mb-2">
            <p className="text-muted fs-xs text-uppercase fw-semibold mb-0">Uptime (24h)</p>
            {hasMonitor && !isLoading ? (
              <span className="fs-sm fw-semibold text-body text-nowrap mb-0">
                {last24BarWindow.uptimePercent.toFixed(1)}%
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <div className="d-flex align-items-center gap-2 text-muted py-1" role="status">
              <Spinner animation="border" size="sm" />
              <span className="fs-xs">Loading uptime…</span>
            </div>
          ) : isError ? (
            <p className="text-danger fs-xs mb-0">{error?.message ?? 'Could not load uptime monitor.'}</p>
          ) : !hasMonitor ? (
            <p className="text-muted fs-xs mb-0">
              {data?.message?.trim() || 'No uptime monitor linked for this site yet.'}
            </p>
          ) : (
            <>
              <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                <span
                  className={`badge badge-soft-${urMonitorStatusVariant(data?.monitor?.status)} text-uppercase fs-xxs`}
                >
                  {urMonitorStatusLabel(data?.monitor?.status)}
                </span>
                {last24BarWindow.incidentCount > 0 ? (
                  <span className="fs-xs text-muted">
                    {last24BarWindow.incidentCount} incident{last24BarWindow.incidentCount === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <SiteUptimeBars
                bars={uptimeBars}
                fullWidth
                className="site-uptime-bars--health-tab"
              />
            </>
          )}
        </div>

        <Button variant="link" className="align-self-start p-0 mt-auto" onClick={onGoHealth}>
          View health details →
        </Button>
      </CardBody>
    </Card>
  );
};

export default SiteOverviewHealthCard;
