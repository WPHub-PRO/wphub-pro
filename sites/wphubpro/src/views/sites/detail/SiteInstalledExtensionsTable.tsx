import DataTable from '@/components/table/DataTable';
import TablePagination from '@/components/table/TablePagination';
import { TABLE_ACTION_ICON_DANGER_CLASS } from '@/components/table/tableActionClasses';
import { useNotificationContext } from '@/context/useNotificationContext';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import { useSiteInstalledPluginNavigation } from '@/domains/sites/useSiteInstalledPluginNavigation';
import {
  bridgeRowHasPlatformUpdate,
  useBridgePluginPlatformVersion,
} from '@/domains/bridge/platformBridgeVersion';
import { formatAvailableUpdate, hasUpdate } from '@/domains/sites/installedMeta';
import { findLibraryItemsForInstalledPlugin } from '@/domains/sites/installedPluginLibraryMatch';
import { findLibraryItemsForInstalledTheme } from '@/domains/sites/installedThemeLibraryMatch';
import {
  isBridgePluginFile,
  runPluginUpdateForSite,
  siteInstalledPluginSortingFn,
  sortInstalledPluginsWithBridgeFirst,
  type SitePluginUpdateChoice,
} from '@/domains/sites/pluginUpdateFromSite';
import {
  runPluginsBulkForSite,
  runThemesBulkForSite,
  toBulkPluginItem,
  toBulkPluginItemForUpdate,
  toBulkThemeItem,
  toBulkThemeItemForUpdate,
  type PluginsBulkAction,
  type ThemesBulkAction,
} from '@/domains/sites/extensionBulkFromSite';
import { runPluginActivateForSite, runPluginDeactivateForSite } from '@/domains/sites/pluginActivateFromSite';
import { runThemeActivateForSite } from '@/domains/sites/themeActivateFromSite';
import { runThemeUpdateForSite, type SiteThemeUpdateChoice } from '@/domains/sites/themeUpdateFromSite';
import { runPluginUninstallForSite, runThemeDeleteForSite } from '@/domains/sites/extensionRemoveFromSite';
import { useLibraryItems } from '@/hooks/useLibrary';
import type { WordPressPlugin, WordPressTheme } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { TbProgressBolt, TbTrash } from 'react-icons/tb';
import { Button, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Link } from 'react-router';
import type { MouseEvent } from 'react';
import PluginUpdateSourceModal from '@/views/sites/detail/PluginUpdateSourceModal';
import ThemeUpdateSourceModal from '@/views/sites/detail/ThemeUpdateSourceModal';
import SiteExtensionRemoveConfirmModal from '@/views/sites/detail/SiteExtensionRemoveConfirmModal';

const pluginHelper = createColumnHelper<WordPressPlugin>();
const themeHelper = createColumnHelper<WordPressTheme>();

const installedPluginGlobalFilterFn: FilterFn<WordPressPlugin> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? '').trim().toLowerCase();
  if (!q) return true;
  const p = row.original;
  return (
    String(p.name ?? '').toLowerCase().includes(q) ||
    String(p.plugin ?? '').toLowerCase().includes(q) ||
    String(p.version ?? '').toLowerCase().includes(q) ||
    String(p.status ?? '').toLowerCase().includes(q) ||
    String(p.author ?? '').toLowerCase().includes(q)
  );
};

const installedThemeGlobalFilterFn: FilterFn<WordPressTheme> = (row, _columnId, filterValue) => {
  const q = String(filterValue ?? '').trim().toLowerCase();
  if (!q) return true;
  const t = row.original;
  return (
    String(t.name ?? '').toLowerCase().includes(q) ||
    String(t.stylesheet ?? '').toLowerCase().includes(q) ||
    String(t.version ?? '').toLowerCase().includes(q) ||
    String(t.status ?? '').toLowerCase().includes(q)
  );
};

type SiteInstalledPluginsTableProps = {
  siteId?: string;
  plugins: WordPressPlugin[];
  emptyMessage: string;
};

export function SiteInstalledPluginsTable({ siteId, plugins, emptyMessage }: SiteInstalledPluginsTableProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { data: platformBridgeVersion } = useBridgePluginPlatformVersion();
  const { data: libraryItems = [] } = useLibraryItems();
  const { onPluginClick, getPluginDetailPath } = useSiteInstalledPluginNavigation(siteId);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [togglingPluginKey, setTogglingPluginKey] = useState<string | null>(null);
  /** Target state while wp-proxy request is in flight (controlled switch UX). */
  const [togglingTowardActive, setTogglingTowardActive] = useState<boolean | null>(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [modalPlugin, setModalPlugin] = useState<WordPressPlugin | null>(null);
  const [removePlugin, setRemovePlugin] = useState<WordPressPlugin | null>(null);
  const [uninstallingKey, setUninstallingKey] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkPluginAction, setBulkPluginAction] = useState<PluginsBulkAction | ''>('');
  const [bulkPluginBusy, setBulkPluginBusy] = useState(false);
  const [bulkPluginsRemove, setBulkPluginsRemove] = useState<WordPressPlugin[] | null>(null);

  const runPluginUpdate = useCallback(
    async (plugin: WordPressPlugin, choice: SitePluginUpdateChoice) => {
      if (!siteId) return;
      setUpdatingKey(plugin.plugin);
      try {
        const res = await runPluginUpdateForSite(siteId, plugin, choice);
        if (res.ok) {
          showNotification({ title: 'Update', message: res.message, variant: 'success' });
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          if (user?.$id) {
            void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
            void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
          }
        } else {
          showNotification({ title: 'Update failed', message: res.message, variant: 'danger' });
        }
      } catch (e) {
        showNotification({
          title: 'Update failed',
          message: e instanceof Error ? e.message : String(e),
          variant: 'danger',
        });
      } finally {
        setUpdatingKey(null);
        setShowSourceModal(false);
        setModalPlugin(null);
      }
    },
    [queryClient, showNotification, siteId, user?.$id],
  );

  const onTogglePluginStatus = useCallback(
    async (plugin: WordPressPlugin, wantActive: boolean) => {
      if (!siteId || !plugin.plugin?.trim()) return;
      setTogglingPluginKey(plugin.plugin);
      setTogglingTowardActive(wantActive);
      try {
        const res = wantActive
          ? await runPluginActivateForSite(siteId, plugin.plugin)
          : await runPluginDeactivateForSite(siteId, plugin.plugin);
        if (res.ok) {
          showNotification({
            title: wantActive ? 'Activated' : 'Deactivated',
            message: res.message,
            variant: 'success',
          });
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          if (user?.$id) {
            void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
            void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
          }
        } else {
          showNotification({ title: 'Plugin status', message: res.message, variant: 'danger' });
        }
      } catch (e) {
        showNotification({
          title: 'Plugin status',
          message: e instanceof Error ? e.message : String(e),
          variant: 'danger',
        });
      } finally {
        setTogglingPluginKey(null);
        setTogglingTowardActive(null);
      }
    },
    [queryClient, showNotification, siteId, user?.$id],
  );

  const onUpdateClick = useCallback(
    (p: WordPressPlugin) => {
      if (!siteId || !p.plugin?.trim()) return;
      const bridgePlat = bridgeRowHasPlatformUpdate(p, platformBridgeVersion);
      if (isBridgePluginFile(p.plugin)) {
        if (hasUpdate(p) || bridgePlat) {
          void runPluginUpdate(p, { kind: 'wordpress_org' });
        }
        return;
      }
      if (!hasUpdate(p)) return;
      const forSlug = findLibraryItemsForInstalledPlugin(libraryItems, p);
      if (forSlug.length > 0) {
        setModalPlugin(p);
        setShowSourceModal(true);
      } else {
        void runPluginUpdate(p, { kind: 'wordpress_org' });
      }
    },
    [libraryItems, platformBridgeVersion, runPluginUpdate, siteId],
  );

  const runPluginUninstall = useCallback(
    async (plugin: WordPressPlugin) => {
      if (!siteId || !plugin.plugin?.trim()) return;
      setUninstallingKey(plugin.plugin);
      try {
        const res = await runPluginUninstallForSite(siteId, plugin.plugin);
        if (res.ok) {
          showNotification({ title: 'Plugin removed', message: res.message, variant: 'success' });
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          if (user?.$id) {
            void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
            void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
          }
        } else {
          showNotification({ title: 'Remove failed', message: res.message, variant: 'danger' });
        }
      } catch (e) {
        showNotification({
          title: 'Remove failed',
          message: e instanceof Error ? e.message : String(e),
          variant: 'danger',
        });
      } finally {
        setUninstallingKey(null);
        setRemovePlugin(null);
      }
    },
    [queryClient, showNotification, siteId, user?.$id],
  );

  const data = useMemo(() => sortInstalledPluginsWithBridgeFirst(plugins), [plugins]);
  const columns = useMemo(
    () => [
      pluginHelper.display({
        id: 'select',
        header: ({ table: tbl }) => (
          <input
            type="checkbox"
            className="form-check-input m-0"
            aria-label="Select all plugins on this page"
            checked={tbl.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) {
                el.indeterminate = tbl.getIsSomePageRowsSelected() && !tbl.getIsAllPageRowsSelected();
              }
            }}
            onChange={tbl.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <div data-row-click-ignore onClick={(e) => e.stopPropagation()}>
            <Form.Check
              type="checkbox"
              className="mb-0"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              aria-label={`Select plugin ${row.original.name || row.original.plugin}`}
            />
          </div>
        ),
      }),
      pluginHelper.accessor('name', {
        header: 'Name',
        sortingFn: siteInstalledPluginSortingFn,
        cell: ({ getValue, row }) => {
          const name = String(getValue() || '—');
          const plugin = row.original;
          const detailPath = getPluginDetailPath(plugin);
          const inner = (
            <span className="fw-medium text-truncate d-inline-block align-middle" style={{ maxWidth: '18rem' }} title={name}>
              {name}
            </span>
          );
          if (detailPath) {
            return (
              <Link
                to={detailPath}
                className="text-reset text-decoration-none"
                onClick={(e: MouseEvent<HTMLAnchorElement>) => onPluginClick(plugin, e)}
              >
                {inner}
              </Link>
            );
          }
          return inner;
        },
      }),
      pluginHelper.accessor('version', {
        id: 'version',
        header: 'Version',
        sortingFn: siteInstalledPluginSortingFn,
        cell: ({ getValue, row }) => {
          const p = row.original;
          const showUpdate = hasUpdate(p) || bridgeRowHasPlatformUpdate(p, platformBridgeVersion);
          const availableVersion = bridgeRowHasPlatformUpdate(p, platformBridgeVersion)
            ? String(platformBridgeVersion || '').trim() || '—'
            : formatAvailableUpdate(p.update ?? null);
          const installedVersion = String(getValue() || '').trim();
          const installedLabel = installedVersion ? `v${installedVersion}` : '—';
          const availableLabel =
            availableVersion && availableVersion !== '—' ? `v${availableVersion}` : availableVersion;
          const busy = updatingKey === p.plugin;
          const can = Boolean(siteId && p.plugin?.trim());
          const tooltipText =
            !siteId || !p.plugin?.trim() ? 'Missing site or plugin file' : 'Update this plugin on the site';
          const tipId = `plugin-update-tip-${String(p.plugin || row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const updateButton = (
            <Button
              type="button"
              size="sm"
              variant="soft-success"
              className="rounded d-inline-flex align-items-center gap-1"
              disabled={!can || busy}
              aria-busy={busy}
              aria-label={tooltipText}
              title={tooltipText}
              onClick={() => onUpdateClick(p)}
            >
              {busy ? (
                <span className="fs-sm">…</span>
              ) : (
                <>
                  <TbProgressBolt className="fs-lg" aria-hidden />
                  install
                </>
              )}
            </Button>
          );
          return (
            <div className="d-flex flex-column gap-1">
              <span className={`fs-xs ${showUpdate ? 'text-warning fw-medium' : ''}`}>
                {installedLabel}
              </span>
              {showUpdate && (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="fs-xs text-nowrap">
                    New update available{' '}
                    <span className="text-success fw-bold">{availableLabel}</span>
                  </span>
                  <OverlayTrigger placement="top" overlay={<Tooltip id={tipId}>{tooltipText}</Tooltip>}>
                    <span className="d-inline-block">{updateButton}</span>
                  </OverlayTrigger>
                </div>
              )}
            </div>
          );
        },
      }),
      pluginHelper.accessor('status', {
        header: 'Status',
        sortingFn: siteInstalledPluginSortingFn,
        cell: ({ row }) => {
          const p = row.original;
          const active = p.status === 'active';
          const busy = togglingPluginKey === p.plugin;
          const checked =
            busy && togglingTowardActive !== null ? togglingTowardActive : active;
          const bridge = isBridgePluginFile(p.plugin);
          const cannotDeactivateBridge = bridge && active;
          const can = Boolean(siteId && p.plugin?.trim());
          const disabled = !can || busy || cannotDeactivateBridge;
          const tipId = `plugin-status-tip-${String(p.plugin || row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const aria =
            cannotDeactivateBridge
              ? 'WPHubPro Bridge cannot be deactivated from the Hub'
              : checked
                ? 'Active — click to deactivate'
                : 'Inactive — click to activate';
          const control = (
            <Form.Check
              type="switch"
              role="switch"
              id={`site-plugin-active-${tipId}`}
              className="mb-0"
              checked={checked}
              disabled={disabled}
              aria-label={aria}
              aria-busy={busy}
              onChange={(e) => {
                void onTogglePluginStatus(p, e.target.checked);
              }}
            />
          );
          if (cannotDeactivateBridge) {
            return (
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id={tipId}>WPHubPro Bridge cannot be deactivated from the Hub.</Tooltip>
                }
              >
                <span className="d-inline-block">{control}</span>
              </OverlayTrigger>
            );
          }
          return control;
        },
      }),
      pluginHelper.display({
        id: 'remove',
        header: () => <span className="visually-hidden">Remove</span>,
        cell: ({ row }) => {
          const p = row.original;
          const bridge = isBridgePluginFile(p.plugin);
          const can = Boolean(siteId && p.plugin?.trim());
          const busy = uninstallingKey === p.plugin;
          const tipId = `plugin-remove-tip-${String(p.plugin || row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const removeBtn = (
            <Button
              type="button"
              size="sm"
              variant="outline-danger"
              className={TABLE_ACTION_ICON_DANGER_CLASS}
              disabled={!can || busy || bridge}
              aria-busy={busy}
              aria-label="Remove plugin from site"
              title="Remove plugin from site"
              onClick={() => setRemovePlugin(p)}
            >
              <TbTrash className="fs-lg" aria-hidden />
            </Button>
          );
          if (bridge) {
            return (
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id={tipId}>WPHubPro Bridge cannot be removed from the Hub.</Tooltip>
                }
              >
                <span className="d-inline-block">{removeBtn}</span>
              </OverlayTrigger>
            );
          }
          return (
            <OverlayTrigger placement="top" overlay={<Tooltip id={tipId}>Remove plugin from site</Tooltip>}>
              <span className="d-inline-block">{removeBtn}</span>
            </OverlayTrigger>
          );
        },
      }),
    ],
    [
      onTogglePluginStatus,
      getPluginDetailPath,
      onPluginClick,
      onUpdateClick,
      siteId,
      togglingPluginKey,
      togglingTowardActive,
      platformBridgeVersion,
      uninstallingKey,
      updatingKey,
    ],
  );

  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    enableRowSelection: (row) => !isBridgePluginFile(row.original.plugin),
    getRowId: (row) => row.plugin,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: installedPluginGlobalFilterFn,
  });

  const selectedPluginRows = table.getFilteredSelectedRowModel().rows;
  const selectedPluginsBulk = selectedPluginRows.map((r) => r.original);
  const selectedPluginBulkCount = selectedPluginsBulk.length;

  const executeBulkPlugins = useCallback(
    async (pluginsList: WordPressPlugin[], action: PluginsBulkAction) => {
      if (!siteId) return;
      const items =
        action === 'update'
          ? pluginsList.map(toBulkPluginItemForUpdate)
          : pluginsList.map((p) => toBulkPluginItem(p));
      setBulkPluginBusy(true);
      try {
        const res = await runPluginsBulkForSite(siteId, action, items);
        const partial = res.results.length > 0 && res.results.some((r) => !r.ok);
        if (res.ok) {
          showNotification({
            title: action === 'delete' ? 'Removed' : action === 'update' ? 'Update' : 'Plugins',
            message: res.message,
            variant: partial ? 'warning' : 'success',
          });
          setRowSelection({});
          setBulkPluginAction('');
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          if (user?.$id) {
            void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
            void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
          }
        } else {
          showNotification({ title: 'Bulk action', message: res.message, variant: 'danger' });
        }
      } finally {
        setBulkPluginBusy(false);
        setBulkPluginsRemove(null);
      }
    },
    [queryClient, showNotification, siteId, user?.$id],
  );

  const onBulkPluginsApply = useCallback(() => {
    if (!siteId || !bulkPluginAction || bulkPluginBusy) return;
    if (!selectedPluginsBulk.length) return;
    if (bulkPluginAction === 'update') {
      const eligible = selectedPluginsBulk.filter(
        (p) => hasUpdate(p) || bridgeRowHasPlatformUpdate(p, platformBridgeVersion),
      );
      if (!eligible.length) {
        showNotification({
          title: 'Update',
          message: 'No selected plugins have an available update.',
          variant: 'warning',
        });
        return;
      }
      void executeBulkPlugins(eligible, 'update');
      return;
    }
    if (bulkPluginAction === 'delete') {
      setBulkPluginsRemove(selectedPluginsBulk);
      return;
    }
    void executeBulkPlugins(selectedPluginsBulk, bulkPluginAction);
  }, [
    bulkPluginAction,
    bulkPluginBusy,
    executeBulkPlugins,
    platformBridgeVersion,
    selectedPluginsBulk,
    showNotification,
    siteId,
  ]);

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalItems = table.getFilteredRowModel().rows.length;
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalItems);
  const tableEmptyMessage =
    globalFilter.trim() && totalItems === 0 ? 'No plugins match your search.' : emptyMessage;

  return (
    <>
      <SiteExtensionRemoveConfirmModal
        show={removePlugin !== null}
        title="Remove plugin?"
        description={
          removePlugin
            ? `This will uninstall “${removePlugin.name || removePlugin.plugin}” from the site (run uninstall hooks and delete files). This cannot be undone.`
            : ''
        }
        confirmLabel="Remove plugin"
        isBusy={removePlugin != null && uninstallingKey === removePlugin.plugin}
        onHide={() => {
          if (uninstallingKey) return;
          setRemovePlugin(null);
        }}
        onConfirm={() => {
          if (removePlugin) void runPluginUninstall(removePlugin);
        }}
      />
      <SiteExtensionRemoveConfirmModal
        show={Boolean(bulkPluginsRemove?.length)}
        title="Remove plugins?"
        description={
          bulkPluginsRemove?.length
            ? `This will uninstall ${bulkPluginsRemove.length} plugin(s) from the site: ${bulkPluginsRemove
                .map((p) => p.name || p.plugin)
                .join(', ')}. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove plugins"
        isBusy={bulkPluginBusy}
        onHide={() => {
          if (bulkPluginBusy) return;
          setBulkPluginsRemove(null);
        }}
        onConfirm={() => {
          if (bulkPluginsRemove?.length) void executeBulkPlugins(bulkPluginsRemove, 'delete');
        }}
      />
      {modalPlugin && (
        <PluginUpdateSourceModal
          show={showSourceModal}
          onHide={() => {
            if (updatingKey) return;
            setShowSourceModal(false);
            setModalPlugin(null);
          }}
          plugin={modalPlugin}
          allLibraryItems={libraryItems}
          isSubmitting={updatingKey === modalPlugin.plugin}
          onConfirm={(choice) => {
            if (modalPlugin) void runPluginUpdate(modalPlugin, choice);
          }}
        />
      )}
      {data.length > 0 && (
        <div className="app-search mb-3" style={{ maxWidth: '22rem' }}>
          <input
            type="search"
            className="form-control"
            placeholder="Search plugins…"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            aria-label="Search plugins"
          />
          <LuSearch className="app-search-icon text-muted" />
        </div>
      )}
      <div className="table-responsive border rounded table-select">
        <DataTable<WordPressPlugin>
          table={table}
          className="border rounded"
          emptyMessage={tableEmptyMessage}
          dashboardUniformRows
        />
      </div>
      {table.getRowModel().rows.length > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2 pt-3">
          <Form.Select
            className="extension-bulk-actions-select"
            aria-label="Bulk actions for plugins"
            value={bulkPluginAction}
            onChange={(e) => setBulkPluginAction((e.target.value || '') as PluginsBulkAction | '')}
          >
            <option value="">Bulk actions</option>
            <option value="activate">Activate</option>
            <option value="deactivate">Deactivate</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </Form.Select>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!selectedPluginBulkCount || !bulkPluginAction || bulkPluginBusy}
            onClick={() => void onBulkPluginsApply()}
          >
            Apply
          </Button>
          {selectedPluginBulkCount > 0 ? (
            <span className="text-muted small">{selectedPluginBulkCount} selected</span>
          ) : null}
        </div>
      )}
      {table.getRowModel().rows.length > 0 && (
        <div className="pt-3">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="plugins"
            showInfo
            pageSize={pageSize}
            onPageSizeChange={(size) => table.setPageSize(size)}
            previousPage={table.previousPage}
            canPreviousPage={table.getCanPreviousPage()}
            pageCount={table.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={table.setPageIndex}
            nextPage={table.nextPage}
            canNextPage={table.getCanNextPage()}
          />
        </div>
      )}
    </>
  );
}

type SiteInstalledThemesTableProps = {
  siteId?: string;
  themes: WordPressTheme[];
  emptyMessage: string;
};

export function SiteInstalledThemesTable({ siteId, themes, emptyMessage }: SiteInstalledThemesTableProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { data: libraryItems = [] } = useLibraryItems();
  const [updatingStylesheet, setUpdatingStylesheet] = useState<string | null>(null);
  const [activatingStylesheet, setActivatingStylesheet] = useState<string | null>(null);
  const [togglingTowardActive, setTogglingTowardActive] = useState<boolean | null>(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [modalTheme, setModalTheme] = useState<WordPressTheme | null>(null);
  const [removeTheme, setRemoveTheme] = useState<WordPressTheme | null>(null);
  const [deletingStylesheet, setDeletingStylesheet] = useState<string | null>(null);
  const [themeRowSelection, setThemeRowSelection] = useState<RowSelectionState>({});
  const [bulkThemeAction, setBulkThemeAction] = useState<ThemesBulkAction | ''>('');
  const [bulkThemeBusy, setBulkThemeBusy] = useState(false);
  const [bulkThemesRemove, setBulkThemesRemove] = useState<WordPressTheme[] | null>(null);

  const invalidateSite = useCallback(() => {
    if (!siteId) return;
    void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
    if (user?.$id) {
      void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
    }
  }, [queryClient, siteId, user?.$id]);

  const runThemeUpdate = useCallback(
    async (theme: WordPressTheme, choice: SiteThemeUpdateChoice) => {
      if (!siteId) return;
      setUpdatingStylesheet(theme.stylesheet);
      try {
        const res = await runThemeUpdateForSite(siteId, theme, choice);
        if (res.ok) {
          showNotification({ title: 'Update', message: res.message, variant: 'success' });
          invalidateSite();
        } else {
          showNotification({ title: 'Update failed', message: res.message, variant: 'danger' });
        }
      } catch (e) {
        showNotification({
          title: 'Update failed',
          message: e instanceof Error ? e.message : String(e),
          variant: 'danger',
        });
      } finally {
        setUpdatingStylesheet(null);
        setShowSourceModal(false);
        setModalTheme(null);
      }
    },
    [invalidateSite, showNotification, siteId],
  );

  const onToggleThemeStatus = useCallback(
    async (theme: WordPressTheme, wantActive: boolean) => {
      if (!siteId || !theme.stylesheet?.trim()) return;
      if (!wantActive) return;
      setActivatingStylesheet(theme.stylesheet);
      setTogglingTowardActive(true);
      try {
        const res = await runThemeActivateForSite(siteId, theme.stylesheet);
        if (res.ok) {
          showNotification({ title: 'Activated', message: res.message, variant: 'success' });
          invalidateSite();
        } else {
          showNotification({ title: 'Theme status', message: res.message, variant: 'danger' });
        }
      } catch (e) {
        showNotification({
          title: 'Theme status',
          message: e instanceof Error ? e.message : String(e),
          variant: 'danger',
        });
      } finally {
        setActivatingStylesheet(null);
        setTogglingTowardActive(null);
      }
    },
    [invalidateSite, showNotification, siteId],
  );

  const onUpdateClick = useCallback(
    (t: WordPressTheme) => {
      if (!siteId || !t.stylesheet?.trim() || !hasUpdate(t)) return;
      const forSlug = findLibraryItemsForInstalledTheme(libraryItems, t);
      if (forSlug.length > 0) {
        setModalTheme(t);
        setShowSourceModal(true);
      } else {
        void runThemeUpdate(t, { kind: 'wordpress_org' });
      }
    },
    [libraryItems, runThemeUpdate, siteId],
  );

  const runThemeDelete = useCallback(
    async (theme: WordPressTheme) => {
      if (!siteId || !theme.stylesheet?.trim()) return;
      setDeletingStylesheet(theme.stylesheet);
      try {
        const res = await runThemeDeleteForSite(siteId, theme.stylesheet);
        if (res.ok) {
          showNotification({ title: 'Theme removed', message: res.message, variant: 'success' });
          invalidateSite();
        } else {
          showNotification({ title: 'Remove failed', message: res.message, variant: 'danger' });
        }
      } catch (e) {
        showNotification({
          title: 'Remove failed',
          message: e instanceof Error ? e.message : String(e),
          variant: 'danger',
        });
      } finally {
        setDeletingStylesheet(null);
        setRemoveTheme(null);
      }
    },
    [invalidateSite, showNotification, siteId],
  );

  const data = useMemo(() => themes, [themes]);
  const columns = useMemo(
    () => [
      themeHelper.display({
        id: 'select',
        header: ({ table: tbl }) => (
          <input
            type="checkbox"
            className="form-check-input m-0"
            aria-label="Select all themes on this page"
            checked={tbl.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) {
                el.indeterminate = tbl.getIsSomePageRowsSelected() && !tbl.getIsAllPageRowsSelected();
              }
            }}
            onChange={tbl.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <div data-row-click-ignore onClick={(e) => e.stopPropagation()}>
            <Form.Check
              type="checkbox"
              className="mb-0"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onChange={row.getToggleSelectedHandler()}
              aria-label={`Select theme ${row.original.name || row.original.stylesheet}`}
            />
          </div>
        ),
      }),
      themeHelper.accessor('name', {
        header: 'Name',
        cell: ({ getValue, row }) => {
          const name = String(getValue() || '—');
          const stylesheet = row.original.stylesheet;
          const inner = (
            <span className="fw-medium text-truncate d-inline-block align-middle" style={{ maxWidth: '18rem' }} title={name}>
              {name}
            </span>
          );
          if (siteId && stylesheet) {
            return (
              <Link
                to={ROUTE_PATHS.siteThemeDetailPath(siteId, stylesheet)}
                className="text-reset text-decoration-none"
              >
                {inner}
              </Link>
            );
          }
          return inner;
        },
      }),
      themeHelper.accessor('version', {
        id: 'version',
        header: 'Version',
        cell: ({ getValue, row }) => {
          const t = row.original;
          const showUpdate = hasUpdate(t);
          const availableVersion = formatAvailableUpdate(t.update ?? null);
          const installedVersion = String(getValue() || '').trim();
          const installedLabel = installedVersion ? `v${installedVersion}` : '—';
          const availableLabel =
            availableVersion && availableVersion !== '—' ? `v${availableVersion}` : availableVersion;
          const busy = updatingStylesheet === t.stylesheet;
          const can = Boolean(siteId && t.stylesheet?.trim());
          const tooltipText =
            !siteId || !t.stylesheet?.trim() ? 'Missing site or theme slug' : 'Update this theme on the site';
          const tipId = `theme-update-tip-${String(t.stylesheet || row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const updateButton = (
            <Button
              type="button"
              size="sm"
              variant="soft-success"
              className="rounded d-inline-flex align-items-center gap-1"
              disabled={!can || busy}
              aria-busy={busy}
              aria-label={tooltipText}
              title={tooltipText}
              onClick={() => onUpdateClick(t)}
            >
              {busy ? (
                <span className="fs-sm">…</span>
              ) : (
                <>
                  <TbProgressBolt className="fs-lg" aria-hidden />
                  install
                </>
              )}
            </Button>
          );
          return (
            <div className="d-flex flex-column gap-1">
              <span className={`fs-xs ${showUpdate ? 'text-warning fw-medium' : ''}`}>
                {installedLabel}
              </span>
              {showUpdate && (
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="fs-xs text-nowrap">
                    New update available{' '}
                    <span className="text-success fw-bold">{availableLabel}</span>
                  </span>
                  <OverlayTrigger placement="top" overlay={<Tooltip id={tipId}>{tooltipText}</Tooltip>}>
                    <span className="d-inline-block">{updateButton}</span>
                  </OverlayTrigger>
                </div>
              )}
            </div>
          );
        },
      }),
      themeHelper.accessor('status', {
        header: 'Status',
        cell: ({ row }) => {
          const t = row.original;
          const active = t.status === 'active';
          const busy = activatingStylesheet === t.stylesheet;
          const checked = busy && togglingTowardActive !== null ? togglingTowardActive : active;
          const cannotDeactivateActive = active;
          const can = Boolean(siteId && t.stylesheet?.trim());
          const disabled = !can || busy || cannotDeactivateActive;
          const tipId = `theme-status-tip-${String(t.stylesheet || row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const aria = cannotDeactivateActive
            ? 'Active theme — activate another theme to switch away'
            : checked
              ? 'Active'
              : 'Inactive — click to activate';
          const control = (
            <Form.Check
              type="switch"
              role="switch"
              id={`site-theme-active-${tipId}`}
              className="mb-0"
              checked={checked}
              disabled={disabled}
              aria-label={aria}
              aria-busy={busy}
              onChange={(e) => {
                if (e.target.checked) void onToggleThemeStatus(t, true);
              }}
            />
          );
          if (cannotDeactivateActive) {
            return (
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id={tipId}>Activate another theme to switch away from this one.</Tooltip>
                }
              >
                <span className="d-inline-block">{control}</span>
              </OverlayTrigger>
            );
          }
          return control;
        },
      }),
      themeHelper.display({
        id: 'remove',
        header: () => <span className="visually-hidden">Remove</span>,
        cell: ({ row }) => {
          const t = row.original;
          const active = t.status === 'active';
          const can = Boolean(siteId && t.stylesheet?.trim());
          const busy = deletingStylesheet === t.stylesheet;
          const tipId = `theme-remove-tip-${String(t.stylesheet || row.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const removeBtn = (
            <Button
              type="button"
              size="sm"
              variant="outline-danger"
              className={TABLE_ACTION_ICON_DANGER_CLASS}
              disabled={!can || busy || active}
              aria-busy={busy}
              aria-label="Remove theme from site"
              title="Remove theme from site"
              onClick={() => setRemoveTheme(t)}
            >
              <TbTrash className="fs-lg" aria-hidden />
            </Button>
          );
          if (active) {
            return (
              <OverlayTrigger
                placement="top"
                overlay={
                  <Tooltip id={tipId}>Switch to another theme in WordPress before removing this one.</Tooltip>
                }
              >
                <span className="d-inline-block">{removeBtn}</span>
              </OverlayTrigger>
            );
          }
          return (
            <OverlayTrigger placement="top" overlay={<Tooltip id={tipId}>Remove theme from site</Tooltip>}>
              <span className="d-inline-block">{removeBtn}</span>
            </OverlayTrigger>
          );
        },
      }),
    ],
    [
      activatingStylesheet,
      deletingStylesheet,
      onToggleThemeStatus,
      onUpdateClick,
      siteId,
      togglingTowardActive,
      updatingStylesheet,
    ],
  );

  const [themeGlobalFilter, setThemeGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const themeTable = useReactTable({
    data,
    columns,
    state: { sorting, pagination, rowSelection: themeRowSelection, globalFilter: themeGlobalFilter },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setThemeRowSelection,
    onGlobalFilterChange: setThemeGlobalFilter,
    enableRowSelection: (row) => row.original.status !== 'active',
    getRowId: (row) => row.stylesheet,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: installedThemeGlobalFilterFn,
  });

  const selectedThemeRows = themeTable.getFilteredSelectedRowModel().rows;
  const selectedThemesBulk = selectedThemeRows.map((r) => r.original);
  const selectedThemeBulkCount = selectedThemesBulk.length;

  const executeBulkThemes = useCallback(
    async (themesList: WordPressTheme[], action: ThemesBulkAction) => {
      if (!siteId) return;
      const items = themesList.map((t) =>
        action === 'update' ? toBulkThemeItemForUpdate(t) : toBulkThemeItem(t),
      );
      setBulkThemeBusy(true);
      try {
        const res = await runThemesBulkForSite(siteId, action, items);
        const partial = res.results.length > 0 && res.results.some((r) => !r.ok);
        if (res.ok) {
          showNotification({
            title: action === 'delete' ? 'Removed' : 'Update',
            message: res.message,
            variant: partial ? 'warning' : 'success',
          });
          setThemeRowSelection({});
          setBulkThemeAction('');
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          if (user?.$id) {
            void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
            void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
          }
        } else {
          showNotification({ title: 'Bulk action', message: res.message, variant: 'danger' });
        }
      } finally {
        setBulkThemeBusy(false);
        setBulkThemesRemove(null);
      }
    },
    [queryClient, showNotification, siteId, user?.$id],
  );

  const onBulkThemesApply = useCallback(() => {
    if (!siteId || !bulkThemeAction || bulkThemeBusy) return;
    if (!selectedThemesBulk.length) return;
    if (bulkThemeAction === 'update') {
      const eligible = selectedThemesBulk.filter((t) => hasUpdate(t));
      if (!eligible.length) {
        showNotification({
          title: 'Update',
          message: 'No selected themes have an available update.',
          variant: 'warning',
        });
        return;
      }
      void executeBulkThemes(eligible, 'update');
      return;
    }
    if (bulkThemeAction === 'delete') {
      setBulkThemesRemove(selectedThemesBulk);
    }
  }, [
    bulkThemeAction,
    bulkThemeBusy,
    executeBulkThemes,
    selectedThemesBulk,
    showNotification,
    siteId,
  ]);

  const pageIndex = themeTable.getState().pagination.pageIndex;
  const pageSize = themeTable.getState().pagination.pageSize;
  const totalItems = themeTable.getFilteredRowModel().rows.length;
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalItems);
  const themeTableEmptyMessage =
    themeGlobalFilter.trim() && totalItems === 0 ? 'No themes match your search.' : emptyMessage;

  return (
    <>
      {modalTheme && (
        <ThemeUpdateSourceModal
          show={showSourceModal}
          onHide={() => {
            if (updatingStylesheet) return;
            setShowSourceModal(false);
            setModalTheme(null);
          }}
          theme={modalTheme}
          allLibraryItems={libraryItems}
          isSubmitting={updatingStylesheet === modalTheme.stylesheet}
          onConfirm={(choice) => {
            if (modalTheme) void runThemeUpdate(modalTheme, choice);
          }}
        />
      )}
      <SiteExtensionRemoveConfirmModal
        show={removeTheme !== null}
        title="Remove theme?"
        description={
          removeTheme
            ? `This will delete “${removeTheme.name || removeTheme.stylesheet}” from the site. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove theme"
        isBusy={removeTheme != null && deletingStylesheet === removeTheme.stylesheet}
        onHide={() => {
          if (deletingStylesheet) return;
          setRemoveTheme(null);
        }}
        onConfirm={() => {
          if (removeTheme) void runThemeDelete(removeTheme);
        }}
      />
      <SiteExtensionRemoveConfirmModal
        show={Boolean(bulkThemesRemove?.length)}
        title="Remove themes?"
        description={
          bulkThemesRemove?.length
            ? `This will delete ${bulkThemesRemove.length} theme(s) from the site: ${bulkThemesRemove
                .map((t) => t.name || t.stylesheet)
                .join(', ')}. This cannot be undone.`
            : ''
        }
        confirmLabel="Remove themes"
        isBusy={bulkThemeBusy}
        onHide={() => {
          if (bulkThemeBusy) return;
          setBulkThemesRemove(null);
        }}
        onConfirm={() => {
          if (bulkThemesRemove?.length) void executeBulkThemes(bulkThemesRemove, 'delete');
        }}
      />
      {data.length > 0 && (
        <div className="app-search mb-3" style={{ maxWidth: '22rem' }}>
          <input
            type="search"
            className="form-control"
            placeholder="Search themes…"
            value={themeGlobalFilter}
            onChange={(e) => {
              setThemeGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            aria-label="Search themes"
          />
          <LuSearch className="app-search-icon text-muted" />
        </div>
      )}
      <div className="table-responsive border rounded table-select">
        <DataTable<WordPressTheme>
          table={themeTable}
          className="border rounded"
          emptyMessage={themeTableEmptyMessage}
          dashboardUniformRows
        />
      </div>
      {themeTable.getRowModel().rows.length > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-2 pt-3">
          <Form.Select
            className="extension-bulk-actions-select"
            aria-label="Bulk actions for themes"
            value={bulkThemeAction}
            onChange={(e) => setBulkThemeAction((e.target.value || '') as ThemesBulkAction | '')}
          >
            <option value="">Bulk actions</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
          </Form.Select>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!selectedThemeBulkCount || !bulkThemeAction || bulkThemeBusy}
            onClick={() => void onBulkThemesApply()}
          >
            Apply
          </Button>
          {selectedThemeBulkCount > 0 ? (
            <span className="text-muted small">{selectedThemeBulkCount} selected</span>
          ) : null}
        </div>
      )}
      {themeTable.getRowModel().rows.length > 0 && (
        <div className="pt-3">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="themes"
            showInfo
            pageSize={pageSize}
            onPageSizeChange={(size) => themeTable.setPageSize(size)}
            previousPage={themeTable.previousPage}
            canPreviousPage={themeTable.getCanPreviousPage()}
            pageCount={themeTable.getPageCount()}
            pageIndex={pageIndex}
            setPageIndex={themeTable.setPageIndex}
            nextPage={themeTable.nextPage}
            canNextPage={themeTable.getCanNextPage()}
          />
        </div>
      )}
    </>
  );
}
