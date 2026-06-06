import DataTable from '@/components/table/DataTable'
import TablePagination from '@/components/table/TablePagination'
import { ROUTE_PATHS } from '@/config/routePaths'
import {
  useAdminCancelSubscription,
  useAdminPauseSubscription,
  useAdminResumeSubscription,
  useAdminSubscriptionList,
  useAdminStripePlansList,
} from '@/domains/admin/finance/hooks'
import type { AdminSubscriptionRow } from '@/domains/admin/finance/types'
import { toPascalCase } from '@/helpers/casing'
import {
  createColumnHelper,
  functionalUpdate,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, CardFooter, CardHeader, Dropdown, DropdownDivider, DropdownItem, DropdownMenu, DropdownToggle, Spinner } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router'
import { LuCircleCheck, LuSearch, LuTag } from 'react-icons/lu'
import {
  TbBan,
  TbCreditCard,
  TbDotsVertical,
  TbPlayerPause,
  TbPlayerPlay,
  TbRefresh,
  TbEye,
} from 'react-icons/tb'
import { useDebounceValue } from 'usehooks-ts'

type SortField =
  | 'startDate'
  | 'endDate'
  | 'nextBillingDate'
  | 'billingCycle'
  | 'plan'
  | 'status'
  | 'username'

const columnHelper = createColumnHelper<AdminSubscriptionRow>()

function statusIconClass(status: string | undefined) {
  const s = (status ?? '').toLowerCase()
  if (s === 'active') return 'text-success'
  if (s === 'trialing') return 'text-info'
  if (s === 'past_due' || s === 'unpaid') return 'text-warning'
  if (s === 'canceled' || s === 'cancelled') return 'text-danger'
  if (s === 'paused') return 'text-secondary'
  return 'text-muted'
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase()
  if (s === 'active' || s === 'trialing') return 'bg-success-subtle text-success'
  if (s === 'canceled' || s === 'cancelled') return 'bg-danger-subtle text-danger'
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'bg-warning-subtle text-warning'
  if (s === 'paused') return 'bg-secondary-subtle text-secondary'
  return 'bg-primary-subtle text-primary'
}

const SubscriptionsTable = () => {
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [planFilter, setPlanFilter] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebounceValue(search, 350)
  const [sortField, setSortField] = useState<SortField>('startDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 8 })

  const cancelMut = useAdminCancelSubscription()
  const pauseMut = useAdminPauseSubscription()
  const resumeMut = useAdminResumeSubscription()
  const actionPending = cancelMut.isPending || pauseMut.isPending || resumeMut.isPending

  const sorting: SortingState = useMemo(
    () => [{ id: sortField, desc: sortDir === 'desc' }],
    [sortField, sortDir],
  )

  const plansQuery = useAdminStripePlansList()
  const planOptions = useMemo(() => {
    const list = plansQuery.data?.plans ?? []
    const opts: { id: string; label: string }[] = []
    for (const p of list) {
      opts.push({ id: p.id, label: p.name })
      for (const ap of p.allPrices ?? []) {
        opts.push({ id: ap.id, label: `${p.name} (${ap.interval})` })
      }
    }
    return opts
  }, [plansQuery.data?.plans])

  const listParams = useMemo(() => {
    const isPrice = planFilter.startsWith('price_')
    return {
      status: status === 'all' ? undefined : status,
      productId: planFilter && !isPrice ? planFilter : undefined,
      priceId: isPrice ? planFilter : undefined,
      search: debouncedSearch.trim() || undefined,
      sortField,
      sortDir,
      maxPages: 5,
    }
  }, [status, planFilter, debouncedSearch, sortField, sortDir])

  const { data, isLoading, error, refetch, isFetching } = useAdminSubscriptionList(listParams, {
    enabled: plansQuery.isFetched,
  })

  const isBootLoading = !plansQuery.isFetched || (isLoading && !data)
  const rows: AdminSubscriptionRow[] = data?.subscriptions ?? []

  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [status, planFilter, debouncedSearch, sortField, sortDir])

  const runAction = useCallback(
    (row: AdminSubscriptionRow, action: 'cancel' | 'pause' | 'resume') => {
      const labels = {
        cancel: 'Cancel this subscription?',
        pause: 'Pause collection?',
        resume: 'Resume subscription?',
      }
      if (!window.confirm(labels[action])) return
      const sid = row.subscriptionId
      const onDone = () => void refetch()
      if (action === 'cancel') {
        cancelMut.mutate({ subscriptionId: sid }, { onSuccess: onDone })
      } else if (action === 'pause') {
        pauseMut.mutate({ subscriptionId: sid }, { onSuccess: onDone })
      } else {
        resumeMut.mutate({ subscriptionId: sid }, { onSuccess: onDone })
      }
    },
    [cancelMut, pauseMut, refetch, resumeMut],
  )

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'subscriptionId',
        header: 'Subscription',
        cell: ({ row }) => (
          <h5 className="m-0 d-flex align-items-center gap-1">
            <TbCreditCard className={`fs-lg ${statusIconClass(row.original.status)}`} />
            <Link
              to={ROUTE_PATHS.adminFinanceSubscriptionPath(row.original.subscriptionId)}
              className="link-reset fw-semibold"
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.subscriptionId}
            </Link>
          </h5>
        ),
      }),
      columnHelper.accessor('startDate', {
        id: 'startDate',
        header: 'Start',
        enableSorting: true,
        cell: ({ getValue }) => {
          const v = getValue()
          return <span className="text-nowrap">{v ? new Date(v * 1000).toLocaleDateString() : '—'}</span>
        },
      }),
      columnHelper.accessor('nextBillingDate', {
        id: 'nextBillingDate',
        header: 'Next billing',
        enableSorting: true,
        cell: ({ getValue }) => {
          const v = getValue()
          return <span className="text-nowrap">{v ? new Date(v * 1000).toLocaleDateString() : '—'}</span>
        },
      }),
      columnHelper.accessor('endDate', {
        id: 'endDate',
        header: 'Period end',
        enableSorting: true,
        cell: ({ getValue }) => {
          const v = getValue()
          return <span className="text-nowrap">{v ? new Date(v * 1000).toLocaleDateString() : '—'}</span>
        },
      }),
      columnHelper.display({
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => {
          const name = row.original.customerName ?? row.original.username ?? '—'
          const email = row.original.customerEmail ?? row.original.userId ?? ''
          const initial = (name && name !== '—' ? name : email || '?').charAt(0).toUpperCase()
          return (
            <div className="d-flex justify-content-start align-items-center gap-2">
              <div className="avatar-sm flex-shrink-0">
                <span className="avatar-title text-bg-primary fw-bold rounded-circle">{initial}</span>
              </div>
              <div>
                <h5 className="text-nowrap fs-base mb-0 lh-base">{name}</h5>
                {email ? <p className="text-muted fs-xs mb-0">{email}</p> : null}
              </div>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: 'plan',
        header: 'Plan',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-nowrap">{row.original.planName ?? row.original.priceId ?? '—'}</span>
        ),
      }),
      columnHelper.accessor('billingCycle', {
        id: 'billingCycle',
        header: 'Cycle',
        enableSorting: true,
        cell: ({ getValue }) => <span className="text-capitalize">{getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className={`badge ${statusBadgeClass(getValue())} badge-label`}>
            {toPascalCase(getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const r = row.original
          const paused = r.status === 'paused'
          return (
            <div className="text-end" data-row-click-ignore onClick={(e) => e.stopPropagation()}>
              <Dropdown align="end">
                <DropdownToggle
                  variant="link"
                  className="drop-arrow-none fs-xxl link-reset text-muted p-0"
                  aria-label="Subscription actions"
                  title="Subscription actions"
                >
                  <TbDotsVertical aria-hidden />
                </DropdownToggle>
                <DropdownMenu>
                  <DropdownItem as={Link} to={ROUTE_PATHS.adminFinanceSubscriptionPath(r.subscriptionId)}>
                    <TbEye className="me-1 align-middle" aria-hidden /> View details
                  </DropdownItem>
                  <DropdownDivider />
                  {paused ? (
                    <DropdownItem
                      as="button"
                      type="button"
                      disabled={actionPending}
                      onClick={() => runAction(r, 'resume')}
                    >
                      <TbPlayerPlay className="me-1 align-middle" aria-hidden /> Resume
                    </DropdownItem>
                  ) : (
                    <DropdownItem
                      as="button"
                      type="button"
                      disabled={actionPending}
                      onClick={() => runAction(r, 'pause')}
                    >
                      <TbPlayerPause className="me-1 align-middle" aria-hidden /> Pause
                    </DropdownItem>
                  )}
                  <DropdownDivider />
                  <DropdownItem
                    as="button"
                    type="button"
                    className="text-danger d-flex align-items-center"
                    disabled={actionPending}
                    onClick={() => runAction(r, 'cancel')}
                  >
                    <TbBan className="me-1 align-middle" aria-hidden /> Cancel
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          )
        },
      }),
    ],
    [actionPending, runAction],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, pagination },
    onPaginationChange: setPagination,
    manualSorting: true,
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting)
      const s = next[0]
      if (!s) return
      setSortField(s.id as SortField)
      setSortDir(s.desc ? 'desc' : 'asc')
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalItems = table.getFilteredRowModel().rows.length
  const start = totalItems === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min((pageIndex + 1) * pageSize, totalItems)

  const openRow = useCallback(
    (r: AdminSubscriptionRow) => {
      if (actionPending) return
      navigate(ROUTE_PATHS.adminFinanceSubscriptionPath(r.subscriptionId))
    },
    [actionPending, navigate],
  )

  if (isBootLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center py-5">
        <Spinner animation="border" role="status" className="text-primary">
          <span className="visually-hidden">Loading…</span>
        </Spinner>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="border-light d-flex flex-column flex-xl-row flex-wrap align-items-stretch align-items-xl-center justify-content-xl-between gap-3">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <div className="app-search">
            <input
              type="search"
              className="form-control"
              placeholder="Search by ID, username, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search subscriptions"
            />
            <LuSearch className="app-search-icon text-muted" />
          </div>
          <Button
            variant="soft-secondary"
            size="sm"
            className="d-inline-flex align-items-center gap-1"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <TbRefresh className="fs-lg" />
            Refresh
          </Button>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="me-1 fw-semibold d-none d-sm-inline text-muted small">Filter</span>
          <div className="app-search">
            <select
              className="form-select form-control my-1 my-md-0"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
              <option value="unpaid">Unpaid</option>
              <option value="paused">Paused</option>
              <option value="incomplete">Incomplete</option>
            </select>
            <LuCircleCheck className="app-search-icon text-muted" />
          </div>
          <div className="app-search" style={{ minWidth: 200 }}>
            <select
              className="form-select form-control my-1 my-md-0"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              aria-label="Plan or price"
            >
              <option value="">All plans & prices</option>
              {planOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <LuCircleCheck className="app-search-icon text-muted" />
          </div>
          <div className="app-search">
            <select
              className="form-select form-control my-1 my-md-0"
              value={pageSize}
              onChange={(e) => setPagination((p) => ({ ...p, pageIndex: 0, pageSize: Number(e.target.value) }))}
              aria-label="Rows per page"
            >
              {[5, 8, 10, 15, 20, 25].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
            <LuTag className="app-search-icon text-muted" />
          </div>
        </div>
      </CardHeader>

      {error && <p className="text-danger small px-3 pt-2 mb-0">{error.message}</p>}
      <p className="text-muted small px-3 pt-2 mb-0">
        Loaded up to {data?.fetchedPages ?? 0} API page(s) from Stripe (100 per page). Refine filters if the list
        is truncated.
      </p>

      <DataTable<AdminSubscriptionRow>
        table={table}
        className="border rounded"
        onRowClick={openRow}
        rowClassName={(r) => (r.hubArchived ? 'table-secondary' : undefined)}
        emptyMessage="No subscriptions match your filters."
      />

      {table.getRowModel().rows.length > 0 && (
        <CardFooter className="border-0">
          <TablePagination
            totalItems={totalItems}
            start={start}
            end={end}
            itemsName="subscriptions"
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
  )
}

export default SubscriptionsTable
