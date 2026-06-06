import { ROUTE_PATHS } from '@/config/routePaths'
import { useAdminSubscriptionList } from '@/domains/admin/finance/hooks'
import type { AdminPlanDetailPayload } from '@/domains/admin/finance/types'
import { Link } from 'react-router'
import { Alert, Spinner, Table } from 'react-bootstrap'

type FinancePlanDetailSubscriptionsTabProps = {
  productId: string
  fallbackSubscribers: AdminPlanDetailPayload['subscribers']
}

const FinancePlanDetailSubscriptionsTab = ({
  productId,
  fallbackSubscribers,
}: FinancePlanDetailSubscriptionsTabProps) => {
  const { data, isLoading, error } = useAdminSubscriptionList({ productId, maxPages: 20 })

  const rows = data?.subscriptions ?? []
  const useFallback = !isLoading && !error && rows.length === 0 && fallbackSubscribers.length > 0

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-4">
        <Spinner animation="border" />
      </div>
    )
  }

  if (error) {
    return <Alert variant="danger">{error.message}</Alert>
  }

  if (useFallback) {
    return (
      <>
        <Alert variant="info" className="small">
          Showing subscribers from the plan summary. Use subscription search for a full Stripe export.
        </Alert>
        <SubscriptionsTableBody
          rows={fallbackSubscribers.map((s) => ({
            subscriptionId: s.subscriptionId,
            name: s.name || s.userId || '—',
            email: s.email,
            status: s.status,
          }))}
        />
      </>
    )
  }

  if (rows.length === 0) {
    return <p className="text-muted mb-0">No subscriptions found for this plan.</p>
  }

  return (
    <SubscriptionsTableBody
      rows={rows.map((r) => ({
        subscriptionId: r.subscriptionId,
        name: r.customerName || r.username || r.userId || '—',
        email: r.customerEmail ?? '—',
        status: r.status,
      }))}
    />
  )
}

function SubscriptionsTableBody({
  rows,
}: {
  rows: { subscriptionId: string; name: string; email: string; status: string }[]
}) {
  return (
    <div className="table-responsive border rounded">
      <Table hover size="sm" striped className="table table-custom table-centered table-nowrap mb-0 align-middle">
        <thead className="bg-light align-middle bg-opacity-25 thead-sm">
          <tr className="text-uppercase fs-xxs">
            <th>Customer</th>
            <th>Email</th>
            <th>Subscription</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.subscriptionId}>
              <td className="small">{s.name}</td>
              <td className="small">{s.email}</td>
              <td className="small">
                <Link to={ROUTE_PATHS.adminFinanceSubscriptionPath(s.subscriptionId)}>{s.subscriptionId}</Link>
              </td>
              <td className="small text-capitalize">{s.status}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

export default FinancePlanDetailSubscriptionsTab
