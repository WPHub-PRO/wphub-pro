import UptimeIncidentsTable, {
  type UptimeIncidentSortColumn,
} from '@/components/sites/UptimeIncidentsTable'
import TablePagination from '@/components/table/TablePagination'
import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb.tsx'
import { buildLibraryDashboardRows, useLibraryWpVersionMap } from '@/domains/library'
import { useDashboardUptimeIncidents, useSites, useSitesStatusPoll } from '@/domains/sites'
import { useLibraryItems } from '@/hooks/useLibrary'
import { useSitesUpdateStats } from '@/hooks/useSitesUpdateStats'
import { buildMonitorIdToSiteIdMap, incidentEndedMs, incidentMonitorId, incidentStartedMs, normalizeMonitorId } from '@/lib/uptimeIncidentHours'
import { incidentRootCause, incidentStatusLabel } from '@/lib/uptimeIncidentDisplay'
import type { Site } from '@/types'
import DashboardSitesLibraryTabs from '@/views/dashboard/components/DashboardSitesLibraryTabs'
import StatisticWidget from '@/views/dashboards/dashboard2/components/StatisticWidget'
import type { StatisticType } from '@/views/dashboards/dashboard2/statisticTypes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardBody, CardFooter, Col, Container, Row, Spinner } from 'react-bootstrap'
import { LuTag } from 'react-icons/lu'
import { TbActivityHeartbeat, TbBellRinging, TbHeart, TbPackage, TbPlugConnected, TbWorld } from 'react-icons/tb'

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

const DASHBOARD_INCIDENTS_PAGE_SIZE = 10;
const DASHBOARD_INCIDENTS_MAX_PAGES = 3;
const DASHBOARD_INCIDENTS_MAX_ITEMS = DASHBOARD_INCIDENTS_PAGE_SIZE * DASHBOARD_INCIDENTS_MAX_PAGES;

function incidentDurationMs(row: Record<string, unknown>): number {
  const nowMs = Date.now();
  const started = incidentStartedMs(row);
  const ended = incidentEndedMs(row, nowMs);
  if (started <= 0 || ended <= started) return -1;
  return ended - started;
}

function compareDashboardIncidents(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  column: UptimeIncidentSortColumn,
  direction: 'asc' | 'desc',
  siteSortLabel: (row: Record<string, unknown>) => string,
): number {
  let cmp = 0;
  switch (column) {
    case 'site':
      cmp = siteSortLabel(a).localeCompare(siteSortLabel(b), undefined, { sensitivity: 'base' });
      break;
    case 'status':
      cmp = incidentStatusLabel(a).localeCompare(incidentStatusLabel(b), undefined, { sensitivity: 'base' });
      break;
    case 'rootCause':
      cmp = incidentRootCause(a).localeCompare(incidentRootCause(b), undefined, { sensitivity: 'base' });
      break;
    case 'started':
      cmp = incidentStartedMs(a) - incidentStartedMs(b);
      break;
    case 'duration':
      cmp = incidentDurationMs(a) - incidentDurationMs(b);
      break;
  }
  return direction === 'asc' ? cmp : -cmp;
}

function DashboardUptimeIncidentsCard({ sites }: { sites: Site[] }) {
  const { data = [], isLoading, isError, error } = useDashboardUptimeIncidents();
  const [pageIndex, setPageIndex] = useState(0);
  const [statusFilter, setStatusFilter] = useState('All');
  const [siteFilter, setSiteFilter] = useState('All');
  const [sortColumn, setSortColumn] = useState<UptimeIncidentSortColumn>('started');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const monitorToSiteId = useMemo(() => buildMonitorIdToSiteIdMap(sites), [sites]);
  const siteById = useMemo(() => new Map(sites.map((s) => [s.$id, s])), [sites]);

  const statusOptions = useMemo(() => {
    const labels = new Set<string>();
    for (const row of data) {
      labels.add(incidentStatusLabel(row));
    }
    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const siteFilterOptions = useMemo(() => {
    const siteIds = new Set<string>();
    for (const row of data) {
      const siteId = monitorToSiteId.get(normalizeMonitorId(incidentMonitorId(row)));
      if (siteId) siteIds.add(siteId);
    }
    return Array.from(siteIds)
      .map((siteId) => {
        const site = siteById.get(siteId);
        const label = site?.siteName?.trim() || site?.siteUrl?.trim() || siteId;
        return { siteId, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, monitorToSiteId, siteById]);

  const filteredIncidents = useMemo(() => {
    let rows = data;
    if (statusFilter !== 'All') {
      rows = rows.filter((row) => incidentStatusLabel(row) === statusFilter);
    }
    if (siteFilter !== 'All') {
      rows = rows.filter((row) => {
        const siteId = monitorToSiteId.get(normalizeMonitorId(incidentMonitorId(row)));
        return siteId === siteFilter;
      });
    }
    return rows;
  }, [data, statusFilter, siteFilter, monitorToSiteId]);

  const getSiteSortLabel = useCallback(
    (row: Record<string, unknown>) => {
      const monitorId = incidentMonitorId(row);
      const siteId = monitorToSiteId.get(normalizeMonitorId(monitorId));
      if (!siteId) return monitorId || '';
      const site = siteById.get(siteId);
      return site?.siteName?.trim() || site?.siteUrl?.trim() || siteId;
    },
    [monitorToSiteId, siteById],
  );

  const incidents = useMemo(() => {
    const rows = [...filteredIncidents];
    rows.sort((a, b) => compareDashboardIncidents(a, b, sortColumn, sortDirection, getSiteSortLabel));
    return rows.slice(0, DASHBOARD_INCIDENTS_MAX_ITEMS);
  }, [filteredIncidents, sortColumn, sortDirection, getSiteSortLabel]);
  const pageCount = Math.min(
    DASHBOARD_INCIDENTS_MAX_PAGES,
    Math.max(1, Math.ceil(incidents.length / DASHBOARD_INCIDENTS_PAGE_SIZE)),
  );
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  const paginatedIncidents = useMemo(() => {
    const start = safePageIndex * DASHBOARD_INCIDENTS_PAGE_SIZE;
    return incidents.slice(start, start + DASHBOARD_INCIDENTS_PAGE_SIZE);
  }, [incidents, safePageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [statusFilter, siteFilter, sortColumn, sortDirection]);

  useEffect(() => {
    if (pageIndex >= pageCount) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pageIndex]);

  useEffect(() => {
    if (statusFilter !== 'All' && !statusOptions.includes(statusFilter)) {
      setStatusFilter('All');
    }
  }, [statusFilter, statusOptions]);

  useEffect(() => {
    if (siteFilter !== 'All' && !siteFilterOptions.some((option) => option.siteId === siteFilter)) {
      setSiteFilter('All');
    }
  }, [siteFilter, siteFilterOptions]);

  const totalItems = incidents.length;
  const start = totalItems === 0 ? 0 : safePageIndex * DASHBOARD_INCIDENTS_PAGE_SIZE + 1;
  const end = Math.min(start + DASHBOARD_INCIDENTS_PAGE_SIZE - 1, totalItems);
  const hasActiveFilters = statusFilter !== 'All' || siteFilter !== 'All';

  const resolveSiteLabel = useCallback(
    (monitorId: string) => {
      const siteId = monitorToSiteId.get(normalizeMonitorId(monitorId));
      if (!siteId) {
        return { label: monitorId || '—' };
      }
      const site = siteById.get(siteId);
      const label = site?.siteName?.trim() || site?.siteUrl?.trim() || siteId;
      return { label, siteId };
    },
    [monitorToSiteId, siteById],
  );

  const handleSortChange = useCallback(
    (column: UptimeIncidentSortColumn) => {
      if (sortColumn === column) {
        setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(column);
        setSortDirection('asc');
      }
    },
    [sortColumn],
  );

  return (
    <Card className="h-100 d-flex flex-column">
      <CardBody className="flex-grow-1">
        <div className="d-flex align-items-center gap-2 mb-3">
          <TbBellRinging className="text-primary" size={20} aria-hidden />
          <h6 className="fs-base mb-0">Incidents (last 7 days)</h6>
        </div>
        {!isLoading && !isError && data.length > 0 && (
          <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3 mb-3">
            <span className="me-1 fw-semibold d-none d-md-inline text-muted small">Filter</span>

            <div className="app-search">
              <select
                className="form-select form-control"
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">Status</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <LuTag className="app-search-icon text-muted" />
            </div>

            <div className="app-search">
              <select
                className="form-select form-control"
                aria-label="Filter by site"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
              >
                <option value="All">Site</option>
                {siteFilterOptions.map(({ siteId, label }) => (
                  <option key={siteId} value={siteId}>
                    {label}
                  </option>
                ))}
              </select>
              <TbWorld className="app-search-icon text-muted" />
            </div>
          </div>
        )}
        {isLoading ? (
          <Spinner animation="border" size="sm" role="status">
            <span className="visually-hidden">Loading…</span>
          </Spinner>
        ) : isError ? (
          <p className="text-danger fs-sm mb-0">{error?.message ?? 'Could not load incidents.'}</p>
        ) : (
          <UptimeIncidentsTable
            incidents={paginatedIncidents}
            showSiteColumn
            resolveSiteLabel={resolveSiteLabel}
            sortable
            sort={{ column: sortColumn, direction: sortDirection }}
            onSortChange={handleSortChange}
            emptyMessage={
              hasActiveFilters
                ? 'No incidents match your filters.'
                : 'No incidents recorded in this window.'
            }
          />
        )}
      </CardBody>
      {!isLoading && !isError && totalItems > 0 && (
        <CardFooter className="border-0 flex-shrink-0">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="incidents"
            showInfo
            previousPage={() => setPageIndex((p) => Math.max(0, p - 1))}
            canPreviousPage={safePageIndex > 0}
            pageCount={pageCount}
            pageIndex={safePageIndex}
            setPageIndex={setPageIndex}
            nextPage={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
            canNextPage={safePageIndex < pageCount - 1}
          />
        </CardFooter>
      )}
    </Card>
  );
}

const DashboardPage = () => {
  const { data: sites, isLoading: sitesLoading } = useSites();
  const { data: libraryItems = [], isLoading: libraryLoading, isError: libraryError, error: libraryErr } =
    useLibraryItems();
  const wpVersions = useLibraryWpVersionMap(libraryItems);
  const libraryRows = useMemo(
    () => buildLibraryDashboardRows(libraryItems, {}, wpVersions),
    [libraryItems, wpVersions],
  );
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
            <Col xs={12} lg={6}>
              <DashboardUptimeIncidentsCard sites={enabledSites} />
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
