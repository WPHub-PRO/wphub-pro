import DataTable, { TABLE_ACTION_GROUP_CLASS, TABLE_ACTION_ICON_MUTED_CLASS } from '@/components/table/DataTable';
import TablePagination from '@/components/table/TablePagination';
import { libraryCategoriesForLibraryItemRow, type LibraryDashboardRow } from '@/domains/library';
import { usePatchLibraryItem } from '@/hooks/useLibrary';
import type { LibraryCategory } from '@/types';
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
} from '@tanstack/react-table';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardBody, Col, Row, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router';
import { TbCopy, TbListDetails, TbStar, TbStarFilled } from 'react-icons/tb';
import LibraryCategoryGroupedSelect from './LibraryCategoryGroupedSelect';
import type { LibraryViewMode } from './ViewModeToggle';

const libraryGlobalFilterFn: FilterFn<LibraryDashboardRow> = () => true;

const columnHelper = createColumnHelper<LibraryDashboardRow>();

function LibraryTableVersionCell({ label }: { label: string }) {
  if (!label || label === '—') {
    return <span className="fw-medium text-reset">—</span>;
  }
  const latestSuffix = ' (latest)';
  if (label.endsWith(latestSuffix)) {
    const version = label.slice(0, -latestSuffix.length);
    return (
      <>
        <span className="fw-medium text-reset">v{version}</span>
        <span className="fs-xs text-muted">{latestSuffix}</span>
      </>
    );
  }
  return <span className="fw-medium text-reset">v{label}</span>;
}

type LibraryTableMeta = { patchPending: boolean };

type LibraryItemsSectionProps = {
  rows: LibraryDashboardRow[];
  view: LibraryViewMode;
  categories?: LibraryCategory[];
};

const LibraryItemsSection = ({ rows, view, categories = [] }: LibraryItemsSectionProps) => {
  const navigate = useNavigate();
  const patchMutation = usePatchLibraryItem();

  const columns = useMemo(() => {
    return [
      columnHelper.display({
        id: 'favourite',
        header: '',
        enableSorting: false,
        cell: ({ row, table }) => {
          const r = row.original;
          const fav = r.isFavourite;
          const patchPending = (table.options.meta as LibraryTableMeta | undefined)?.patchPending ?? false;
          return (
            <div data-row-click-ignore onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn btn-link p-0 text-warning"
                aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
                title={fav ? 'Remove from favourites' : 'Add to favourites'}
                disabled={patchPending}
                onClick={() => {
                  patchMutation.mutate({
                    itemId: r.libraryDocumentId,
                    isFavourite: !fav,
                  });
                }}
              >
                {fav ? <TbStarFilled className="fs-lg" /> : <TbStar className="fs-lg text-muted" />}
              </button>
            </div>
          );
        },
      }),
      columnHelper.accessor('kind', {
        header: 'Type',
        enableColumnFilter: false,
        cell: ({ getValue }) => (
          <span className="fs-xs text-muted">{getValue() === 'plugin' ? 'Plugin' : 'Theme'}</span>
        ),
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: ({ getValue }) => (
          <span
            className="fw-medium text-truncate d-inline-block align-middle"
            style={{ maxWidth: '18rem' }}
            title={String(getValue() || '')}
          >
            {String(getValue() || '—')}
          </span>
        ),
        enableColumnFilter: false,
      }),
      columnHelper.accessor('author', {
        header: 'Author',
        cell: ({ getValue }) => (
          <span
            className="fs-xs text-muted text-truncate d-inline-block"
            style={{ maxWidth: '14rem' }}
            title={String(getValue())}
          >
            {String(getValue() || '—')}
          </span>
        ),
        enableColumnFilter: false,
      }),
      columnHelper.accessor('versionLabel', {
        header: 'Version',
        cell: ({ getValue }) => <LibraryTableVersionCell label={String(getValue() || '')} />,
        enableColumnFilter: false,
      }),
      columnHelper.display({
        id: 'category',
        header: 'Category',
        enableSorting: false,
        cell: ({ row, table }) => {
          const r = row.original;
          const rowCategories = libraryCategoriesForLibraryItemRow(r, categories);
          const patchPending = (table.options.meta as LibraryTableMeta | undefined)?.patchPending ?? false;
          return (
            <div data-row-click-ignore onClick={(e) => e.stopPropagation()}>
              <LibraryCategoryGroupedSelect
                categories={rowCategories}
                value={r.categoryId}
                onChange={(categoryId) =>
                  patchMutation.mutate({
                    itemId: r.libraryDocumentId,
                    categoryId,
                  })
                }
                disabled={patchPending}
                aria-label="Category"
                noneOptionLabel="—"
                noneGroupLabel="No category"
                size="sm"
                className="w-auto max-w-100"
                minWidth="10rem"
              />
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-end" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
              <div className={TABLE_ACTION_GROUP_CLASS}>
                <button
                  type="button"
                  className={TABLE_ACTION_ICON_MUTED_CLASS}
                  aria-label="Copy name"
                  title="Copy name"
                  onClick={() => {
                    void navigator.clipboard?.writeText(r.name);
                  }}
                >
                  <TbCopy className="fs-lg" aria-hidden />
                </button>
              </div>
            </div>
          );
        },
      }),
    ];
  }, [categories]);

  const data = useMemo(() => rows, [rows]);

  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: '', columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: libraryGlobalFilterFn,
    enableColumnFilters: true,
    autoResetPageIndex: false,
    meta: { patchPending: patchMutation.isPending } satisfies LibraryTableMeta,
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalItems = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();

  useEffect(() => {
    if (pageCount < 1) return;
    const lastIndex = pageCount - 1;
    if (pageIndex > lastIndex) {
      table.setPageIndex(lastIndex);
    }
  }, [pageCount, pageIndex, table]);
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalItems);

  if (view === 'grid') {
    return (
      <>
        {rows.length === 0 ? (
          <p className="text-muted text-center py-5 mb-0">No library items match your filters.</p>
        ) : (
          <Row className="g-3">
            {rows.map((r) => {
              const rowCategories = libraryCategoriesForLibraryItemRow(r, categories);
              return (
              <Col key={r.id} xs={12} sm={6} xl={4}>
                <Card className="h-100 shadow-sm">
                  <CardBody>
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                      <span className="badge badge-soft-primary fs-xxs">{r.kind === 'plugin' ? 'Plugin' : 'Theme'}</span>
                      <div className={TABLE_ACTION_GROUP_CLASS}>
                        <button
                          type="button"
                          className="btn btn-link p-0 text-warning"
                          aria-label="Favourite"
                          title={r.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                          onClick={() =>
                            patchMutation.mutate({
                              itemId: r.libraryDocumentId,
                              isFavourite: !r.isFavourite,
                            })
                          }
                        >
                          {r.isFavourite ? <TbStarFilled className="fs-lg" /> : <TbStar className="fs-lg text-muted" />}
                        </button>
                        <Link
                          to={ROUTE_PATHS.libraryItemDetailPath(r.kind, r.routeSlug)}
                          className={TABLE_ACTION_ICON_MUTED_CLASS}
                          aria-label="View details"
                          title="View details"
                        >
                          <TbListDetails className="fs-lg" aria-hidden />
                        </Link>
                        <button
                          type="button"
                          className={TABLE_ACTION_ICON_MUTED_CLASS}
                          aria-label="Copy name"
                          title="Copy name"
                          onClick={() => void navigator.clipboard?.writeText(r.name)}
                        >
                          <TbCopy className="fs-lg" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <h6 className="mb-2 text-truncate" title={r.name}>
                      <Link
                        to={ROUTE_PATHS.libraryItemDetailPath(r.kind, r.routeSlug)}
                        className="text-reset text-decoration-none"
                      >
                        {r.name}
                      </Link>
                    </h6>
                    <LibraryCategoryGroupedSelect
                      categories={rowCategories}
                      value={r.categoryId}
                      onChange={(categoryId) =>
                        patchMutation.mutate({
                          itemId: r.libraryDocumentId,
                          categoryId,
                        })
                      }
                      disabled={patchMutation.isPending}
                      aria-label="Category"
                      placeholder="Category…"
                      noneOptionLabel="—"
                      noneGroupLabel="No category"
                      size="sm"
                      className="mb-2 w-100"
                    />
                    <p className="text-muted fs-xs mb-2">
                      <span className="fw-semibold text-body">Version:</span> {r.versionLabel}
                    </p>
                    <p className="text-muted fs-xs mb-2">
                      <span className="fw-semibold text-body">Author:</span> {r.author}
                    </p>
                    {r.tags.length > 0 && (
                      <div className="d-flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span key={t} className="badge badge-soft-secondary fs-xxs">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </Col>
            );
            })}
          </Row>
        )}
        {patchMutation.isPending && (
          <div className="position-fixed bottom-0 end-0 p-3">
            <Spinner size="sm" />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <DataTable<LibraryDashboardRow>
        table={table}
        className="border rounded"
        emptyMessage="No library items match your filters."
        dashboardUniformRows
        onRowClick={(r) => void navigate(ROUTE_PATHS.libraryItemDetailPath(r.kind, r.routeSlug))}
      />

      {table.getRowModel().rows.length > 0 && (
        <div className="pt-3">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="items"
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
        </div>
      )}
    </>
  );
};

export default LibraryItemsSection;
