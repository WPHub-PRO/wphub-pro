import DataTable, {
  TABLE_ACTION_GROUP_CLASS,
  TABLE_ACTION_ICON_DANGER_CLASS,
  TABLE_ACTION_ICON_LIGHT_CLASS,
} from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import ComponentCard from '@/components/cards/ComponentCard'
import { ROUTE_PATHS } from '@/config/routePaths'
import { hasUpdate, parsePluginsMeta, parseThemesMeta, useDashboardUptimeBarsIncidents, useDeleteSite } from '@/domains/sites'
import { useNotificationContext } from '@/context/useNotificationContext'
import type { Site } from '@/types'
import {
  createColumnHelper,
  type ColumnFiltersState,
  type FilterFn,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, CardFooter, CardHeader, OverlayTrigger, Tooltip } from 'react-bootstrap'
import DeleteSiteConfirmModal from '@/views/sites/detail/DeleteSiteConfirmModal'
import SiteUptimeBars from '@/components/sites/SiteUptimeBars'
import SiteUptimeStatusDot from '@/components/sites/SiteUptimeStatusDot'
import { buildSiteUptimeBarsBySiteId } from '@/lib/uptimeIncidentHours'
import { LuHeart, LuSearch, LuTag } from 'react-icons/lu'
import { MdFlashOff, MdFlashOn } from 'react-icons/md'
import { TbExternalLink, TbListDetails, TbTrash } from 'react-icons/tb'

/** Matches wphubpro `SitesTableCells` StatusIcon — Material `flash_on` / `flash_off`, orange when connected */
const CONNECTED_FLASH_COLOR = '#ea580c';

function connectionTooltip(site: Site): string {
  return site.status === 'connected' ? 'Connected' : 'Disconnected';
}

function ConnectionFlashIcon({ site }: { site: Site }) {
  const isConnected = site.status === 'connected';
  return (
    <OverlayTrigger
      placement="top"
      overlay={<Tooltip id={`conn-${site.$id}`}>{connectionTooltip(site)}</Tooltip>}
    >
      <span className="d-inline-flex align-items-center" style={{ lineHeight: 0 }}>
        {isConnected ? (
          <MdFlashOn
            aria-hidden
            style={{
              fontSize: '1.5rem',
              color: CONNECTED_FLASH_COLOR,
            }}
          />
        ) : (
          <MdFlashOff aria-hidden style={{ fontSize: '1.5rem', color: '#9e9e9e' }} />
        )}
      </span>
    </OverlayTrigger>
  );
}

function availableUpdateCounts(site: Site): { plugins: number; themes: number } {
  const plugins = parsePluginsMeta(site.pluginsMeta).filter(hasUpdate).length;
  const themes = parseThemesMeta(site.themesMeta).filter(hasUpdate).length;
  return { plugins, themes };
}

const siteGlobalFilterFn: FilterFn<Site> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? '').trim().toLowerCase();
  if (!q) return true;
  const s = row.original;
  return (
    String(s.siteName ?? '')
      .toLowerCase()
      .includes(q) ||
    String(s.siteUrl ?? '')
      .toLowerCase()
      .includes(q) ||
    String(s.status ?? '')
      .toLowerCase()
      .includes(q) ||
    String(s.healthStatus ?? '')
      .toLowerCase()
      .includes(q)
  );
};

const columnHelper = createColumnHelper<Site>();

/** Inline row actions; omit open when there is no URL (max three actions: details, open, delete). */
type SiteTableRowActionId = 'details' | 'open' | 'delete';

function visibleSiteTableRowActions(site: Site): SiteTableRowActionId[] {
  const actions: SiteTableRowActionId[] = ['details'];
  if (String(site.siteUrl ?? '').trim()) actions.push('open');
  actions.push('delete');
  return actions;
}

type DashboardSitesTableProps = {
  sites: Site[];
  /** Rows per page on first render (dashboard uses 5; full Sites page uses 10). */
  initialPageSize?: number;
  /** When true, omit outer card chrome (for use inside a tabbed card). */
  embedded?: boolean;
};

const DashboardSitesTable = ({ sites, initialPageSize = 5, embedded = false }: DashboardSitesTableProps) => {
  const navigate = useNavigate();
  const { showNotification } = useNotificationContext();
  const deleteSite = useDeleteSite();
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const data = useMemo(() => sites, [sites]);
  const { data: uptimeIncidents = [], isLoading: uptimeBarsLoading } = useDashboardUptimeBarsIncidents();
  const barsBySiteId = useMemo(
    () => buildSiteUptimeBarsBySiteId(sites, uptimeIncidents),
    [sites, uptimeIncidents],
  );

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'uptimeStatus',
        header: '',
        meta: { headerAlign: 'start' as const },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="d-flex justify-content-center align-items-center">
            <SiteUptimeStatusDot site={row.original} />
          </div>
        ),
      }),
      columnHelper.accessor('siteName', {
        header: 'SITE',
        cell: ({ getValue }) => <span className="fw-medium">{String(getValue() || '—')}</span>,
        enableColumnFilter: false,
      }),
      columnHelper.accessor('siteUrl', {
        header: 'URL',
        cell: ({ getValue }) => {
          const url = String(getValue() || '');
          return (
            <span className="text-truncate d-inline-block" style={{ maxWidth: '16rem' }} title={url}>
              {url || '—'}
            </span>
          );
        },
        enableColumnFilter: false,
      }),
      columnHelper.accessor('status', {
        header: 'Connection',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        cell: ({ row }) => <ConnectionFlashIcon site={row.original} />,
      }),
      columnHelper.accessor(
        (row) => {
          const { plugins, themes } = availableUpdateCounts(row);
          return plugins + themes;
        },
        {
          id: 'availableUpdates',
          header: 'AVAILABLE UPDATES',
          cell: ({ row }) => {
            const { plugins, themes } = availableUpdateCounts(row.original);
            return (
              <span className="fs-xs text-muted">
                plugin: {plugins} theme: {themes}
              </span>
            );
          },
          enableColumnFilter: false,
        },
      ),
      columnHelper.accessor('healthStatus', {
        header: 'UPTIME',
        meta: { headerAlign: 'center' as const },
        filterFn: 'equalsString',
        enableColumnFilter: true,
        cell: ({ row }) => {
          const site = row.original;
          const bars = barsBySiteId.get(site.$id);
          return (
            <div className="d-flex justify-content-center align-items-center py-1" style={{ minWidth: '6.5rem' }}>
              <SiteUptimeBars bars={bars ?? []} isLoading={uptimeBarsLoading} />
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: 'ACTIONS',
        enableSorting: false,
        cell: ({ row }) => {
          const site = row.original;
          const rowActions = visibleSiteTableRowActions(site);

          return (
            <div className="text-end" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
              <div className={TABLE_ACTION_GROUP_CLASS}>
                {rowActions.includes('details') ? (
                  <Link
                    to={ROUTE_PATHS.siteDetailPath(site.$id)}
                    className={TABLE_ACTION_ICON_LIGHT_CLASS}
                    aria-label="Site details"
                    title="Site details"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TbListDetails className="fs-lg" aria-hidden />
                  </Link>
                ) : null}
                {rowActions.includes('open') && site.siteUrl ? (
                  <a
                    href={site.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={TABLE_ACTION_ICON_LIGHT_CLASS}
                    aria-label="Open site"
                    title="Open site"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TbExternalLink className="fs-lg" aria-hidden />
                  </a>
                ) : null}
                {rowActions.includes('delete') ? (
                  <Button
                    type="button"
                    variant="outline-danger"
                    size="sm"
                    className={TABLE_ACTION_ICON_DANGER_CLASS}
                    disabled={deleteSite.isPending}
                    aria-label="Delete"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(site);
                    }}
                  >
                    <TbTrash className="fs-lg" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          );
        },
      }),
    ],
    [deleteSite.isPending, barsBySiteId, uptimeBarsLoading]
  );

  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: initialPageSize });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: siteGlobalFilterFn,
    enableColumnFilters: true,
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalItems = table.getFilteredRowModel().rows.length;
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalItems);

  const tableBlock = (
    <>
      <CardHeader className="border-light flex-shrink-0">
        <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3 w-100">
          <div className="app-search flex-grow-1" style={{ minWidth: '10rem', maxWidth: '22rem' }}>
            <input
              type="search"
              className="form-control"
              placeholder="Search name or URL…"
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(e.target.value)}
              aria-label="Search sites"
            />
            <LuSearch className="app-search-icon text-muted" />
          </div>

          <span className="me-1 fw-semibold d-none d-md-inline text-muted small">Filter</span>

          <div className="app-search">
            <select
              className="form-select form-control"
              aria-label="Filter by connection"
              value={(table.getColumn('status')?.getFilterValue() as string | undefined) ?? 'All'}
              onChange={(e) =>
                table.getColumn('status')?.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)
              }
            >
              <option value="All">Connection</option>
              <option value="connected">Connected</option>
              <option value="disconnected">Disconnected</option>
            </select>
            <LuTag className="app-search-icon text-muted" />
          </div>

          <div className="app-search">
            <select
              className="form-select form-control"
              aria-label="Filter by health"
              value={(table.getColumn('healthStatus')?.getFilterValue() as string | undefined) ?? 'All'}
              onChange={(e) =>
                table.getColumn('healthStatus')?.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)
              }
            >
              <option value="All">Health</option>
              <option value="healthy">Healthy</option>
              <option value="bad">Needs attention</option>
            </select>
            <LuHeart className="app-search-icon text-muted" />
          </div>
        </div>
      </CardHeader>

      <div className="flex-grow-1 min-h-0 overflow-auto">
        <DataTable<Site>
          table={table}
          className="border rounded"
          emptyMessage="No sites match your filters."
          dashboardUniformRows
          onRowClick={(site) => navigate(ROUTE_PATHS.siteDetailPath(site.$id))}
        />
      </div>

      {table.getRowModel().rows.length > 0 && (
        <CardFooter className="border-0 flex-shrink-0">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="sites"
            showInfo
            pageSize={table.getState().pagination.pageSize}
            onPageSizeChange={(size) => table.setPageSize(size)}
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={table.getState().pagination.pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </CardFooter>
      )}
    </>
  );

  const deleteModalLabel =
    deleteTarget?.siteName?.trim() || deleteTarget?.siteUrl?.trim() || deleteTarget?.$id || '';

  const deleteModal = (
    <DeleteSiteConfirmModal
      show={deleteTarget !== null}
      onHide={() => {
        if (!deleteSite.isPending) setDeleteTarget(null);
      }}
      siteLabel={deleteModalLabel}
      isDeleting={deleteSite.isPending}
      onConfirm={() => {
        if (!deleteTarget) return;
        deleteSite.mutate(deleteTarget.$id, {
          onSuccess: () => setDeleteTarget(null),
          onError: (err: Error) => {
            showNotification({
              title: 'Remove site',
              message: err.message || 'Request failed.',
              variant: 'danger',
            });
          },
        });
      }}
    />
  );

  if (embedded) {
    return (
      <>
        <div className="d-flex flex-column flex-grow-1 min-h-0 h-100 w-100">{tableBlock}</div>
        {deleteModal}
      </>
    );
  }

  return (
    <>
      <ComponentCard
        fillColumnHeight
        title="Sites"
        titleExtra={<span className="badge badge-label badge-soft-secondary fs-xxs">{sites.length} total</span>}
      >
        {tableBlock}
      </ComponentCard>
      {deleteModal}
    </>
  );
};

export default DashboardSitesTable;
