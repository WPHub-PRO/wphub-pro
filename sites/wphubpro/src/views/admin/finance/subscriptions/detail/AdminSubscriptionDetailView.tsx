import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useNotificationContext } from '@/context/useNotificationContext'
import {
  defaultPaymentMethodLabel,
  formatMoneyFromStripe,
  formatUnixSeconds,
  latestInvoiceSummary,
  metadataEntries,
  stripeSubscriptionDashboardUrl,
} from '@/lib/adminSubscriptionView'
import { formatStripeAddress } from '@/lib/adminStripeFormat'
import { useAdminSubscriptionAction, useAdminSubscriptionDetail } from '@/hooks/useAdminSubscriptions'
import { toPascalCase } from '@/helpers/casing'
import { Col, Container, Row, Spinner } from 'react-bootstrap'
import { Link, useParams } from 'react-router'
import { useMemo, type ReactNode } from 'react'
import SubscriptionActivityCard from './components/SubscriptionActivityCard'
import SubscriptionSidebarActions from './components/SubscriptionSidebarActions'
import SubscriptionAddressPanel from './components/SubscriptionAddressPanel'
import SubscriptionBillingPanel from './components/SubscriptionBillingPanel'
import SubscriptionCustomerPanel from './components/SubscriptionCustomerPanel'
import SubscriptionInfoCard from './components/SubscriptionInfoCard'
import SubscriptionMetadataCard from './components/SubscriptionMetadataCard'
import SubscriptionOrderSummary from './components/SubscriptionOrderSummary'
import { subscriptionLineDisplayRows } from './lineDisplay'
import { subscriptionActivityTimeline } from './timelineFromSubscription'

function statusPrimaryBadgeClass(status: string) {
  const s = status.toLowerCase()
  if (s === 'active' || s === 'trialing') return 'badge-soft-success fs-xxs badge-label'
  if (s === 'canceled' || s === 'cancelled') return 'badge-soft-danger fs-xxs badge-label'
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') {
    return 'badge-soft-warning fs-xxs badge-label'
  }
  if (s === 'paused') return 'badge-soft-secondary fs-xxs badge-label'
  return 'badge-soft-info fs-xxs badge-label'
}

const AdminSubscriptionDetailView = () => {
  const { subscriptionId } = useParams<{ subscriptionId: string }>()
  const { showNotification } = useNotificationContext()
  const { data, isLoading, error, refetch } = useAdminSubscriptionDetail(subscriptionId)
  const actionMut = useAdminSubscriptionAction()

  const notifyOk = (title: string, message: string) =>
    showNotification({ title, message, variant: 'success' })
  const notifyErr = (title: string, message: string) =>
    showNotification({ title, message, variant: 'danger' })

  const runAction = (label: string, fn: () => ReturnType<typeof actionMut.mutateAsync>) => {
    void fn()
      .then(() => {
        notifyOk(label, 'Updated.')
        void refetch()
      })
      .catch((e: unknown) => {
        notifyErr(label, e instanceof Error ? e.message : 'Request failed')
      })
  }

  const lines = useMemo(
    () => (data?.subscription ? subscriptionLineDisplayRows(data.subscription as Record<string, unknown>) : []),
    [data?.subscription],
  )

  const activityItems = useMemo(
    () =>
      data?.subscription
        ? subscriptionActivityTimeline(data.subscription as Record<string, unknown>, formatUnixSeconds)
        : [],
    [data?.subscription],
  )

  if (!subscriptionId) {
    return <p className="text-danger">Missing subscription id.</p>
  }
  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <Container fluid className="px-0">
        <p className="text-danger">{error?.message ?? 'Not found'}</p>
        <Link to={ROUTE_PATHS.ADMIN_FINANCE_SUBSCRIPTIONS}>Back to subscriptions</Link>
      </Container>
    )
  }

  const sub = data.subscription as Record<string, unknown>
  const customer = data.customer as Record<string, unknown> | null
  const sid = String(sub.id ?? subscriptionId)
  const status = String(sub.status ?? '—')
  const statusDisplay = toPascalCase(status)
  const paused = Boolean(sub.pause_collection)
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end)
  const inv = latestInvoiceSummary(sub)
  const pmLabel = defaultPaymentMethodLabel(sub.default_payment_method)
  const metaRows = metadataEntries(sub)
  const custEmail = customer && typeof customer.email === 'string' ? customer.email : null
  const custName = customer && typeof customer.name === 'string' ? customer.name : null
  const custPhone = customer && typeof customer.phone === 'string' ? customer.phone : null
  const custId = customer && typeof customer.id === 'string' ? customer.id : null
  const custBalance = customer && typeof customer.balance === 'number' ? customer.balance : null
  const custCurrency = customer && typeof customer.currency === 'string' ? customer.currency : 'usd'
  const addressFormatted =
    customer && typeof customer.address === 'object' && customer.address !== null
      ? formatStripeAddress(customer.address)
      : null
  const customerCreated =
    customer && typeof customer.created === 'number' ? new Date(customer.created * 1000).toLocaleDateString() : null

  const secondBadge: { text: string; icon: 'pause' | 'info' } | null = paused
    ? { text: 'Paused', icon: 'pause' }
    : cancelAtPeriodEnd
      ? { text: 'Cancels at period end', icon: 'info' }
      : null

  const infoRows: { label: string; value: ReactNode }[] = [
    { label: 'Collection', value: String(sub.collection_method ?? '—') },
    {
      label: 'Current period',
      value: (
        <>
          {formatUnixSeconds(sub.current_period_start)} → {formatUnixSeconds(sub.current_period_end)}
        </>
      ),
    },
    { label: 'Created', value: formatUnixSeconds(sub.created) },
    { label: 'Start date', value: formatUnixSeconds(sub.start_date) },
  ]
  if (typeof sub.trial_start === 'number' || typeof sub.trial_end === 'number') {
    infoRows.push({
      label: 'Trial',
      value: (
        <>
          {formatUnixSeconds(sub.trial_start)} → {formatUnixSeconds(sub.trial_end)}
        </>
      ),
    })
  }
  if (typeof sub.cancel_at === 'number') {
    infoRows.push({ label: 'Cancel at', value: formatUnixSeconds(sub.cancel_at) })
  }
  if (typeof sub.canceled_at === 'number') {
    infoRows.push({ label: 'Canceled at', value: formatUnixSeconds(sub.canceled_at) })
  }

  const balanceLine =
    custBalance != null
      ? `Balance: ${formatMoneyFromStripe(Math.abs(custBalance), custCurrency)}${custBalance < 0 ? ' (credit)' : ''}`
      : null

  return (
    <Container fluid className="px-0">
      <PageBreadcrumb
        title="Subscription details"
        subtitle="Finance"
        titleEnd={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            <DocHelpButton contextKey="admin:finance:subscription-detail" />
            <Link to={ROUTE_PATHS.ADMIN_FINANCE_SUBSCRIPTIONS} className="btn btn-sm btn-soft-secondary">
              ← All subscriptions
            </Link>
          </span>
        }
      />

      <Row className="justify-content-center">
        <Col xxl={12}>
          <Row>
            <Col xl={9} className="d-flex flex-column gap-3">
              <SubscriptionOrderSummary
                subscriptionId={sid}
                status={statusDisplay}
                statusBadgeClass={statusPrimaryBadgeClass(status)}
                secondBadge={secondBadge}
                createdLabel={formatUnixSeconds(sub.created)}
                openStripeHref={stripeSubscriptionDashboardUrl(sid)}
                lines={lines}
                inv={inv}
                invoiceLinkTo={inv.id ? ROUTE_PATHS.adminFinanceInvoicePath(inv.id) : null}
              />

              <SubscriptionInfoCard rows={infoRows} />

              <SubscriptionActivityCard items={activityItems} subscriptionId={sid} />

              {metaRows.length > 0 ? <SubscriptionMetadataCard entries={metaRows} /> : null}
            </Col>
            <Col xl={3} className="d-flex flex-column gap-3">
              <SubscriptionSidebarActions
                busy={actionMut.isPending}
                status={status}
                paused={paused}
                onCancelAtEnd={() => {
                  if (!window.confirm('Schedule cancellation at the end of the current billing period?')) return
                  runAction('Cancel at period end', () =>
                    actionMut.mutateAsync({
                      subscriptionId: sid,
                      action: 'cancel',
                      atPeriodEnd: true,
                    }),
                  )
                }}
                onCancelNow={() => {
                  if (!window.confirm('Cancel this subscription immediately? This cannot be undone.')) return
                  runAction('Cancel now', () =>
                    actionMut.mutateAsync({
                      subscriptionId: sid,
                      action: 'cancel',
                    }),
                  )
                }}
                onPause={() => {
                  if (!window.confirm('Pause collection? Invoices may be marked uncollectible.')) return
                  runAction('Pause', () => actionMut.mutateAsync({ subscriptionId: sid, action: 'pause' }))
                }}
                onResume={() => {
                  if (!window.confirm('Resume billing for this subscription?')) return
                  runAction('Resume', () => actionMut.mutateAsync({ subscriptionId: sid, action: 'resume' }))
                }}
              />
              <SubscriptionCustomerPanel
                name={custName}
                email={custEmail}
                phone={custPhone}
                sinceLabel={customerCreated}
                customerId={custId}
                balanceLine={balanceLine}
              />

              <SubscriptionAddressPanel
                title="Address"
                name={custName}
                addressLines={addressFormatted}
                phone={custPhone}
                email={custEmail}
                badge={addressFormatted ? 'On file' : null}
              />

              <SubscriptionBillingPanel paymentMethodLabel={pmLabel} invStatus={inv.status} />
            </Col>
          </Row>
        </Col>
      </Row>
    </Container>
  )
}

export default AdminSubscriptionDetailView
