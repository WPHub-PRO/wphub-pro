import DataTable, { TABLE_ACTION_ICON_LIGHT_CLASS } from '@/components/table/DataTable';
import TablePagination from '@/components/table/TablePagination';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useDeleteTickets } from '@/domains/tickets';
import type { Ticket } from '@/types';
import {
  type ColumnDef,
  type ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Button, Card, CardFooter, CardHeader, Col, Form, Row, Spinner } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'
import { LuSearch, LuShuffle, LuTag } from 'react-icons/lu';
import { TbAlertTriangle, TbEye } from 'react-icons/tb';
import { Link, useNavigate } from 'react-router';
import {
  categoryLabel,
  formatPriority,
  formatTicketStatus,
  priorityBadgeClass,
  statusBadgeClass,
} from '@/views/support/supportUi';

const columnHelper = createColumnHelper<Ticket>();

type Props = {
  tickets: Ticket[];
  adminMode: boolean;
  newTicketTo: string;
};

export function SupportTicketsTable({ tickets, adminMode, newTicketTo }: Props) {
  const navigate = useNavigate();
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { showNotification } = useNotificationContext();
  const deleteTickets = useDeleteTickets();

  const columns = useMemo((): ColumnDef<Ticket>[] => {
    const cols: ColumnDef<Ticket>[] = [];

    if (adminMode) {
      cols.push(
        columnHelper.display({
          id: 'select',
          header: ({ table }) => (
            <input
              type="checkbox"
              className="form-check-input m-0"
              aria-label="Select all tickets on this page"
              checked={table.getIsAllPageRowsSelected()}
              ref={(el) => {
                if (el) {
                  el.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected();
                }
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
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
                aria-label={`Select ticket ${row.original.$id}`}
              />
            </div>
          ),
        }),
      );
    }

    cols.push(
      columnHelper.accessor('$id', {
        header: 'ID',
        cell: ({ row }) => (
          <Link to={ROUTE_PATHS.supportTicketPath(row.original.$id)} className="fw-semibold link-reset">
            #{row.original.$id.slice(0, 8)}…
          </Link>
        ),
      }),
    );

    if (adminMode) {
      cols.push(
        columnHelper.display({
          id: 'user',
          header: 'User',
          cell: ({ row }) => {
            const r = row.original.reporter;
            if (!r) return <span className="text-muted">—</span>;
            const label = r.name?.trim() || r.email || r.id.slice(0, 8);
            return <span>{label}</span>;
          },
        }),
      );
    }

    cols.push(
      columnHelper.accessor('subject', { header: 'Subject' }),
      columnHelper.accessor('category', {
        header: 'Category',
        cell: ({ row }) => categoryLabel(row.original.category),
      }),
      columnHelper.accessor('priority', {
        header: 'Priority',
        cell: ({ row }) => (
          <span className={`badge ${priorityBadgeClass(row.original.priority)}`}>
            {formatPriority(row.original.priority)}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        filterFn: 'equalsString',
        enableColumnFilter: true,
        cell: ({ row }) => (
          <span className={`badge ${statusBadgeClass(row.original.status)} badge-label`}>
            {formatTicketStatus(row.original.status)}
          </span>
        ),
      }),
      columnHelper.accessor('$createdAt', {
        header: 'Created',
        cell: ({ row }) => new Date(row.original.$createdAt).toLocaleString(),
      }),
      columnHelper.accessor('$updatedAt', {
        header: 'Updated',
        cell: ({ row }) => new Date(row.original.$updatedAt).toLocaleString(),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Link
            to={ROUTE_PATHS.supportTicketPath(row.original.$id)}
            className={TABLE_ACTION_ICON_LIGHT_CLASS}
            aria-label={`View ticket ${row.original.$id.slice(0, 8)}…`}
            title="View ticket"
          >
            <TbEye className="fs-lg" aria-hidden />
          </Link>
        ),
      }),
    );

    return cols;
  }, [adminMode]);

  const table = useReactTable({
    data: tickets,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
    enableColumnFilters: true,
    enableRowSelection: adminMode,
    getRowId: (row) => row.$id,
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const totalItems = table.getFilteredRowModel().rows.length;
  const start = pageIndex * pageSize + 1;
  const end = Math.min(start + pageSize - 1, totalItems);

  const statusFilterVal = (table.getColumn('status')?.getFilterValue() as string) ?? '';
  const selectedCount = table.getSelectedRowModel().rows.length;

  const confirmBulkDelete = () => {
    const ids = table.getSelectedRowModel().rows.map((r) => r.original.$id);
    if (!ids.length) return;
    deleteTickets.mutate(
      { ticketIds: ids },
      {
        onSuccess: (res) => {
          setBulkDeleteOpen(false);
          table.resetRowSelection();
          const n = res?.deletedTicketIds?.length ?? 0;
          const failed = res?.failed;
          if (failed?.length) {
            showNotification({
              title: 'Partially deleted',
              message: `Removed ${n} ticket(s); ${failed.length} could not be deleted.`,
              variant: 'warning',
            });
          } else {
            showNotification({
              title: 'Deleted',
              message: `Removed ${n} ticket(s). Messages and activity history were removed.`,
              variant: 'success',
            });
          }
        },
        onError: (e) =>
          showNotification({
            title: 'Delete failed',
            message: e instanceof Error ? e.message : 'Try again.',
            variant: 'danger',
          }),
      },
    );
  };

  return (
    <Row>
      <Col cols={12}>
        <Card>
          <CardHeader className="border-light justify-content-between flex-wrap gap-2">
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <div className="app-search">
                <input
                  type="search"
                  className="form-control"
                  placeholder="Search…"
                  value={globalFilter ?? ''}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  aria-label="Search tickets"
                />
                <LuSearch className="app-search-icon text-muted" />
              </div>
              <Link to={newTicketTo} className="btn btn-primary btn-sm">
                New ticket
              </Link>
              {adminMode && selectedCount > 0 ? (
                <Button variant="outline-danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  Delete selected ({selectedCount})
                </Button>
              ) : null}
            </div>

            <div className="d-flex flex-wrap align-items-center gap-2">
              <span className="me-1 fw-semibold d-none d-md-inline text-muted small">Filter</span>
              <div className="app-search">
                <select
                  className="form-select form-control my-1 my-md-0"
                  aria-label="Filter by status"
                  value={statusFilterVal}
                  onChange={(e) =>
                    table.getColumn('status')?.setFilterValue(e.target.value === '' ? undefined : e.target.value)
                  }
                >
                  <option value="">All statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting">Waiting</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <LuShuffle className="app-search-icon text-muted" />
              </div>
              <div className="app-search">
                <select
                  className="form-select form-control my-1 my-md-0"
                  aria-label="Filter by priority"
                  value={(table.getColumn('priority')?.getFilterValue() as string) ?? ''}
                  onChange={(e) =>
                    table.getColumn('priority')?.setFilterValue(e.target.value === '' ? undefined : e.target.value)
                  }
                >
                  <option value="">All priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <TbAlertTriangle className="app-search-icon text-muted" />
              </div>
              <div className="app-search">
                <select
                  className="form-select form-control my-1 my-md-0"
                  aria-label="Rows per page"
                  value={table.getState().pagination.pageSize}
                  onChange={(e) => table.setPageSize(Number(e.target.value))}
                >
                {[5, 8, 10, 15, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
                </select>
                <LuTag className="app-search-icon text-muted" />
              </div>
            </div>
          </CardHeader>

          <div className="p-3 pt-0">
            <DataTable<Ticket>
              table={table}
              className="border rounded"
              emptyMessage="No tickets yet"
              onRowClick={(ticket) => void navigate(ROUTE_PATHS.supportTicketPath(ticket.$id))}
            />
          </div>

          {table.getRowModel().rows.length > 0 && (
            <CardFooter className="border-0">
              <TablePagination
                totalItems={totalItems}
                start={start}
                end={end}
                itemsName="tickets"
                showInfo
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
        </Card>

        <Modal show={bulkDeleteOpen} onHide={() => !deleteTickets.isPending && setBulkDeleteOpen(false)} centered>
          <Modal.Header closeButton={!deleteTickets.isPending}>
            <Modal.Title>Delete tickets</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-2">
              Permanently delete <strong>{selectedCount}</strong> ticket{selectedCount === 1 ? '' : 's'}? This removes
              all messages and activity history. This cannot be undone.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" onClick={() => setBulkDeleteOpen(false)} disabled={deleteTickets.isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmBulkDelete} disabled={deleteTickets.isPending || !selectedCount}>
              {deleteTickets.isPending ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </Modal.Footer>
        </Modal>
      </Col>
    </Row>
  );
}
