import DataTable, { TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS } from '@/components/table/DataTable'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useAdminStripePlansList } from '@/domains/admin/finance/hooks'
import type { StripePlan } from '@/types'
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap'
import { useNavigate } from 'react-router'
import { TbListDetails } from 'react-icons/tb'

const columnHelper = createColumnHelper<StripePlan>()

export type FinancePlansListFilter = 'personal' | 'team'

function planRowMatchesFilter(p: StripePlan, filter: FinancePlansListFilter): boolean {
  const t = (p.catalogPlanType ?? '').trim().toLowerCase()
  if (filter === 'team') return t === 'team plan'
  return t !== 'team plan'
}

export type FinancePlansListTabProps = {
  filter: FinancePlansListFilter
  onCreateClick: () => void
}

const FinancePlansListTab = ({ filter, onCreateClick }: FinancePlansListTabProps) => {
  const navigate = useNavigate()
  /** When false (default), only Stripe-active products are listed. */
  const [showInactivePlans, setShowInactivePlans] = useState(false)
  const { data, isLoading, error } = useAdminStripePlansList()

  const plans = data?.plans ?? []
  const subscriptionCountsTruncated = data?.subscriptionCountsTruncated ?? false

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      if (!planRowMatchesFilter(p, filter)) return false
      if (!showInactivePlans && p.status !== 'active') return false
      return true
    })
  }, [plans, filter, showInactivePlans])

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'thumb',
        header: '',
        cell: ({ row }) => {
          const url = row.original.catalogImageUrl?.trim()
          if (!url) return <span className="text-muted">—</span>
          return (
            <img
              src={url}
              alt=""
              className="rounded border bg-light"
              style={{ width: 40, height: 40, objectFit: 'cover' }}
            />
          )
        },
      }),
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.display({
        id: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const t = (row.original.catalogPlanType ?? '').trim().toLowerCase()
          if (t === 'team plan') return <Badge bg="info">Team</Badge>
          if (t === 'personal plan') return <Badge bg="primary">Personal</Badge>
          return <Badge bg="secondary">Unset</Badge>
        },
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: ({ getValue }) => (
          <Badge bg={getValue() === 'active' ? 'success' : 'secondary'}>{getValue()}</Badge>
        ),
      }),
      columnHelper.accessor('monthlyPrice', {
        id: 'monthlyPrice',
        header: 'Monthly',
        cell: ({ getValue }) => getValue() ?? '—',
      }),
      columnHelper.accessor('yearlyPrice', {
        id: 'yearlyPrice',
        header: 'Yearly',
        cell: ({ getValue }) => getValue() ?? '—',
      }),
      columnHelper.accessor('currency', {
        id: 'currency',
        header: 'Currency',
        cell: ({ getValue }) => <span className="text-uppercase">{getValue()}</span>,
      }),
      columnHelper.accessor('activeSubscriptionsCount', {
        id: 'activeSubscriptionsCount',
        header: 'Subscribers',
        enableSorting: true,
        sortingFn: (rowA, rowB, columnId) => {
          const a = rowA.getValue(columnId) as number | undefined
          const b = rowB.getValue(columnId) as number | undefined
          return (a ?? -1) - (b ?? -1)
        },
        cell: ({ getValue }) => {
          const n = getValue()
          return n == null ? '—' : n
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="outline-primary"
            className={TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS}
            aria-label="View plan details"
            title="View plan details"
            onClick={(e) => {
              e.stopPropagation()
              navigate(ROUTE_PATHS.adminFinancePlanPath(row.original.id))
            }}
          >
            <TbListDetails className="fs-lg" aria-hidden />
          </Button>
        ),
      }),
    ],
    [navigate],
  )

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ id: 'name', desc: false }],
    },
  })

  const openRow = (p: StripePlan) => {
    navigate(ROUTE_PATHS.adminFinancePlanPath(p.id))
  }

  if (isLoading) return <Spinner animation="border" />
  if (error) return <p className="text-danger">{error.message}</p>

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <p className="text-muted small mb-0">
          {filter === 'team'
            ? 'Products with Stripe metadata type = team plan.'
            : 'Products with type = personal plan, unset, or any value other than team plan.'}{' '}
          {!showInactivePlans ? 'Inactive products are hidden.' : null}
        </p>
        <div className="d-flex flex-wrap align-items-center gap-3">
          <Form.Check
            type="switch"
            id={`finance-plans-show-inactive-${filter}`}
            className="small user-select-none"
            label="Show inactive plans"
            checked={showInactivePlans}
            onChange={(e) => setShowInactivePlans(e.target.checked)}
          />
          <Button variant="primary" size="sm" onClick={onCreateClick}>
            Create plan
          </Button>
        </div>
      </div>
      {subscriptionCountsTruncated ? (
        <Alert variant="secondary" className="mb-3 py-2 small">
          Some subscription counts may be incomplete: results are capped for performance (Stripe pagination or
          product limit).
        </Alert>
      ) : null}
      <DataTable table={table} className="border rounded" onRowClick={openRow} emptyMessage="No plans in this tab yet." />
    </>
  )
}

export default FinancePlansListTab
