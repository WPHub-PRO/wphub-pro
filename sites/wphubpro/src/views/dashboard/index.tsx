import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb.tsx'
import { buildLibraryDashboardRows } from '@/domains/library'
import { useDashboardUptimeIncidents, useSites, useSitesStatusPoll } from '@/domains/sites'
import { useLibraryItems } from '@/hooks/useLibrary'
import { useSitesUpdateStats } from '@/hooks/useSitesUpdateStats'
import type { Site } from '@/types'
import { formatChecked } from '@/views/sites/detail/siteDetailFormat'
import DashboardSitesLibraryTabs from '@/views/dashboard/components/DashboardSitesLibraryTabs'
import StatisticWidget from '@/views/dashboards/dashboard2/components/StatisticWidget'
import type { StatisticType } from '@/views/dashboards/dashboard2/statisticTypes'
import { useMemo } from 'react'
import { Card, Col, Container, Row, Spinner } from 'react-bootstrap'
import { TbActivityHeartbeat, TbBellRinging, TbHeart, TbPackage, TbPlugConnected } from 'react-icons/tb'

function buildHealthStatItems(sites: Site[], updateStats: ReturnType<typeof useSitesUpdateStats>): StatisticType[] {
  const enabledSites = sites.filter((s) => s.enabled !== false);
  const total = enabledSites.length;
  const connectedCount = enabledSites.filter((s) => s.status === 'connected').length;
  const healthyCount = enabledSites.filter((s) => s.healthStatus === 'healthy').length;
  const disconnectedCount = enabledSites.filter((s) => s.status === 'disconnected').length;
  const sitesNeedingUpdatesCount = updateStats.sitesNeedingUpdatesCount;
  const healthyPct = total > 0 ? Math.round((healthyCount / total) * 100) : 0;
  const connectedPct = total > 0 ? Math.round(((total - disconnectedCount) / total) * 100) : 0;
  const updatesScore =
    connectedCount > 0 ? Math.round((1 - sitesNeedingUpdatesCount / connectedCount) * 100) : 100;
  const totalHealthScore =
    total > 0 ? Math.round((updatesScore + healthyPct + connectedPct) / 3) : 0;

  return [
    {
      icon: TbPackage,
      title: 'Sites needing updates',
      subtitle: 'UPDATE SCORE',
      count: sitesNeedingUpdatesCount,
      variant: sitesNeedingUpdatesCount > 0 ? 'warning' : 'orange',
      progress: updatesScore,
    },
    {
      icon: TbHeart,
      title: 'Healthy sites',
      subtitle: 'HEALTH RATE',
      count: healthyCount,
      variant: 'orange',
      progress: healthyPct,
    },
    {
      icon: TbPlugConnected,
      title: 'Connected sites',
      subtitle: 'CONNECTION',
      count: total - disconnectedCount,
      variant: connectedPct >= 80 ? 'orange' : connectedPct >= 50 ? 'warning' : 'danger',
      progress: connectedPct,
    },
    {
      icon: TbActivityHeartbeat,
      title: 'Health score',
      subtitle: 'OVERALL',
      count: totalHealthScore,
      variant:
        totalHealthScore >= 80 ? 'orange' : totalHealthScore >= 50 ? 'warning' : 'danger',
      progress: totalHealthScore,
    },
  ];
}

function incidentIsoDash(row: Record<string, unknown>): string | undefined {
  const pick =
    row.startedAt ?? row.started_at ?? row.createdAt ?? row.created_at ?? row.date ?? row.time;
  if (pick == null) return undefined;
  const s = String(pick).trim();
  return s || undefined;
}

function incidentSummaryDash(row: Record<string, unknown>): string {
  const msg =
    (typeof row.message === 'string' && row.message.trim()) ||
    (typeof row.reason === 'string' && row.reason.trim()) ||
    '';
  const mid = typeof row._monitorId === 'string' ? row._monitorId.trim() : '';
  const base = msg || 'Incident';
  return mid ? `${base} · monitor ${mid}` : base;
}

function DashboardUptimeIncidentsCard() {
  const { data = [], isLoading, isError, error } = useDashboardUptimeIncidents();

  return (
    <Card className="h-100">
      <Card.Body>
        <div className="d-flex align-items-center gap-2 mb-2">
          <TbBellRinging className="text-primary" size={20} aria-hidden />
          <h6 className="fs-base mb-0">Recent uptime incidents</h6>
        </div>
        <p className="text-muted fs-xxs mb-3">Last 7 days · up to 3 events</p>
        {isLoading ? (
          <Spinner animation="border" size="sm" role="status">
            <span className="visually-hidden">Loading…</span>
          </Spinner>
        ) : isError ? (
          <p className="text-danger fs-sm mb-0">{error?.message ?? 'Could not load incidents.'}</p>
        ) : data.length === 0 ? (
          <p className="text-muted fs-sm mb-0">No incidents in the last 7 days.</p>
        ) : (
          <ul className="list-unstyled mb-0 small d-flex flex-column gap-2">
            {data.map((row, i) => {
              const r = row as Record<string, unknown>;
              return (
                <li key={`uptime-inc-${i}`}>
                  <div className="text-muted fs-xxs">{formatChecked(incidentIsoDash(r))}</div>
                  <div className="text-break">{incidentSummaryDash(r)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Card.Body>
    </Card>
  );
}

const DashboardPage = () => {
  const { data: sites, isLoading: sitesLoading } = useSites();
  const { data: libraryItems = [], isLoading: libraryLoading, isError: libraryError, error: libraryErr } =
    useLibraryItems();
  const libraryRows = useMemo(() => buildLibraryDashboardRows(libraryItems), [libraryItems]);
  const siteList: Site[] = sites ?? [];
  const enabledSites: Site[] = useMemo(() => {
    return siteList.filter((s) => s.enabled !== false);
  }, [siteList]);
  const updateStats = useSitesUpdateStats(enabledSites, { isLoading: sitesLoading });

  useSitesStatusPoll(enabledSites.map((s: Site) => s.$id));

  const statItems = useMemo(
    () => buildHealthStatItems(enabledSites, updateStats),
    [enabledSites, updateStats.sitesNeedingUpdatesCount, sitesLoading]
  );

  return (
    <Container fluid>
      <PageBreadcrumb title="Dashboard" titleEnd={<DocHelpButton contextKey="dashboard" />} />

      {sitesLoading ? (
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" role="status" variant="primary">
            <span className="visually-hidden">Loading…</span>
          </Spinner>
        </div>
      ) : (
        <>
          <Row className="row-cols-xxl-4 row-cols-md-2 row-cols-1 g-3 align-items-stretch mb-3">
            {statItems.map((item, idx) => (
              <Col key={idx}>
                <StatisticWidget item={item} />
              </Col>
            ))}
          </Row>

          <Row className="g-3 mb-3">
            <Col xs={12} md={4}>
              <DashboardUptimeIncidentsCard />
            </Col>
          </Row>

          <Row className="g-3 align-items-stretch">
            <Col xs={12} className="d-flex">
              <DashboardSitesLibraryTabs
                sites={enabledSites}
                libraryRows={libraryRows}
                libraryLoading={libraryLoading}
                libraryError={libraryError}
                libraryErrorMessage={
                  libraryErr instanceof Error ? libraryErr.message : 'Could not load library.'
                }
              />
            </Col>
          </Row>
        </>
      )}
    </Container>
  );
};

export default DashboardPage;
