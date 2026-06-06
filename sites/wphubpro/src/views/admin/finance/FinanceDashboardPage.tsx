import CustomChartJs from '@/components/CustomChartJs'
import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useAdminUsersList } from '@/domains/admin/useAdminUsers'
import { useFinanceAdminEnabled, useFinanceDashboard } from '@/domains/admin/finance/hooks'
import type { FinanceDashboardPeriod } from '@/domains/admin/finance/types'
import type { StatCardType } from '@/views/dashboards/dashboard/components/StatCard'
import { getColor } from '@/helpers/color'
import type { ChartJSOptionsType } from '@/types'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LinearScale,
  PieController,
  Tooltip,
} from 'chart.js'
import { useMemo, useState } from 'react'
import { Card, CardBody, Col, Container, Row, Button, ButtonGroup, Spinner, Table, Badge } from 'react-bootstrap'
import { Link } from 'react-router'
import { TbCreditCard, TbFileInvoice, TbRepeat, TbUsers } from 'react-icons/tb'
import StatCard from '@/views/dashboards/dashboard/components/StatCard'

function formatMoney(cents: number, currency = 'eur') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function currencyNarrowSymbol(currency: string) {
  const parts = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
  }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value ?? '€'
}

const PERIODS: { id: FinanceDashboardPeriod; label: string }[] = [
  { id: 'this_week', label: 'This week' },
  { id: 'month_to_date', label: 'Month to date' },
  { id: 'last_month', label: 'Last month' },
  { id: 'year_to_date', label: 'Year to date' },
  { id: 'last_year', label: 'Last year' },
]

function planChartColors(n: number) {
  const keys = ['primary', 'alpha', 'gamma', 'beta', 'delta', 'secondary'] as const
  return Array.from({ length: n }, (_, i) => getColor(`chart-${keys[i % keys.length]}`))
}

const FinanceDashboardPage = () => {
  const [period, setPeriod] = useState<FinanceDashboardPeriod>('this_week')
  const adminEnabled = useFinanceAdminEnabled()
  const { data, isLoading, error } = useFinanceDashboard(period)
  const { data: usersData } = useAdminUsersList(
    { limit: 1, offset: 0, status: 'active' },
    { enabled: adminEnabled },
  )

  const currency = (data?.currency ?? 'eur').toLowerCase()
  const curSym = currencyNarrowSymbol(currency)

  const statItems = useMemo((): StatCardType[] | null => {
    if (!data?.stats) return null
    const { kpis } = data.stats
    const activeUsers = usersData?.total ?? 0
    return [
      {
        id: 1,
        title: 'Total revenue (period)',
        value: Math.max(0, Math.round((kpis.revenueInPeriodCents ?? 0) / 100)),
        prefix: curSym,
        icon: TbCreditCard,
        iconBg: 'primary',
      },
      {
        id: 2,
        title: 'Unpaid open invoices',
        value: kpis.unpaidOpenInvoicesCount ?? 0,
        icon: TbFileInvoice,
        iconBg: 'warning',
      },
      {
        id: 3,
        title: 'Active users',
        value: activeUsers,
        icon: TbUsers,
        iconBg: 'info',
      },
    ]
  }, [data?.stats, usersData?.total, curSym])

  const totalRevenueChart = useMemo<() => ChartJSOptionsType>(() => {
    const buckets = data?.stats?.buckets ?? []
    return () => ({
      data: {
        labels: buckets.map((b) => b.label),
        datasets: [
          {
            type: 'bar' as const,
            label: 'Revenue',
            data: buckets.map((b) => Math.round(b.revenueCents) / 100),
            borderColor: getColor('chart-primary'),
            backgroundColor: getColor('chart-primary'),
            barThickness: 18,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true },
          title: { display: true, text: 'Total revenue' },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: `Amount (${curSym})` },
          },
        },
      },
    })
  }, [data?.stats?.buckets, curSym])

  const revenueByPlanChart = useMemo<() => ChartJSOptionsType>(() => {
    const rows = data?.stats?.revenueByPlan ?? []
    const labels = rows.map((r) => r.name)
    const values = rows.map((r) => Math.round(r.revenueCents) / 100)
    const colors = planChartColors(labels.length)
    return () => ({
      type: 'doughnut' as const,
      data: {
        labels: labels.length ? labels : ['—'],
        datasets: [
          {
            label: 'Revenue',
            data: values.length ? values : [0],
            backgroundColor: labels.length ? colors : [getColor('chart-gray')],
            borderColor: 'transparent',
            borderWidth: 1,
            weight: 1,
            cutout: '30%',
            radius: '90%',
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            position: 'bottom' as const,
            labels: { usePointStyle: true, pointStyle: 'circle' },
          },
          title: { display: true, text: 'Revenue by plan' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed
                return `${ctx.label}: ${curSym}${typeof v === 'number' ? v.toFixed(2) : v}`
              },
            },
          },
        },
        scales: { x: { display: false }, y: { display: false } },
      },
    })
  }, [data?.stats?.revenueByPlan, curSym])

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border border-danger border-opacity-25 rounded p-3 bg-danger-subtle">
        <p className="text-danger mb-1 fw-semibold">Could not load finance dashboard</p>
        <p className="text-danger small mb-0">
          {error?.message ?? 'Could not load finance data. Try again later or contact support if this persists.'}
        </p>
      </div>
    )
  }

  if (!data.stats) {
    return (
      <div className="border border-warning border-opacity-25 rounded p-3 bg-warning-subtle">
        <p className="text-warning-emphasis mb-1 fw-semibold">Incomplete dashboard response</p>
        <p className="small text-muted mb-0">The server returned an empty dashboard. Try another period or refresh later.</p>
      </div>
    )
  }

  const { kpis, byPlan, upgradeDowngradeNote, truncated, rangeLabel, revenueByPlan: revenueByPlanRows } = data.stats
  const activeSubscriptions = kpis.activeSubscriptionsNow
  const newInPeriod = kpis.newInPeriod
  const canceledInPeriod = kpis.canceledInPeriod
  const unpaidCount = kpis.unpaidOpenInvoicesCount ?? 0
  const unpaidCents = kpis.unpaidOpenInvoicesCents ?? 0
  const recentSubs = data.recentSubscriptions ?? []
  const hasPlanRevenue = (revenueByPlanRows?.length ?? 0) > 0

  return (
    <Container fluid>
      <PageBreadcrumb
        title="Overview"
        subtitle="Finance"
        titleEnd={<DocHelpButton contextKey="admin:finance:dashboard" />}
      />
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <span className="text-muted small me-2">Period</span>
          <ButtonGroup size="sm">
            {PERIODS.map((p) => (
              <Button
                key={p.id}
                variant={period === p.id ? 'primary' : 'outline-primary'}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <span className="text-muted small text-end">{data.rangeLabel ?? rangeLabel}</span>
      </div>

      {(truncated || kpis.revenueAllTimeTruncated) && (
        <p className="text-muted small">Some figures are limited by Stripe list pagination in the function.</p>
      )}
      <p className="text-muted small mb-2">
        Period revenue uses invoice <strong>paid</strong> time (includes new charges, renewals, and upgrade proration).
      </p>
      {(kpis.revenueInPeriodUpgradesCents ?? 0) > 0 && (
        <p className="text-muted small mb-2">
          From plan-change invoices:{' '}
          <strong>{formatMoney(kpis.revenueInPeriodUpgradesCents ?? 0, currency)}</strong>
          {kpis.upgradesInPeriod > 0 ? ` (${kpis.upgradesInPeriod} paid update${kpis.upgradesInPeriod === 1 ? '' : 's'})` : null}
        </p>
      )}

      <Row className="row-cols-xxl-4 row-cols-md-2 row-cols-1 g-3 mb-3">
        {statItems?.[0] && (
          <Col>
            <StatCard item={statItems[0]} />
          </Col>
        )}
        <Col>
          <Card>
            <CardBody>
              <div className="d-flex justify-content-between align-items-center">
                <div className="avatar fs-60 avatar-img-size flex-shrink-0">
                  <span className="avatar-title bg-success-subtle text-success rounded-circle fs-24">
                    <TbRepeat />
                  </span>
                </div>
                <div className="text-end">
                  <h3 className="mb-1 fw-normal">
                    <span>{activeSubscriptions}</span>
                  </h3>
                  <p className="text-muted small mb-1">
                    Active now · new {newInPeriod} · canceled {canceledInPeriod}
                    {kpis.upgradesInPeriod > 0 ? ` · plan upgrades ${kpis.upgradesInPeriod}` : ''}
                  </p>
                  <p className="mb-0 text-muted">
                    <span>Subscriptions</span>
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Col>
        {statItems?.[1] && (
          <Col>
            <StatCard item={statItems[1]} />
          </Col>
        )}
        {statItems?.[2] && (
          <Col>
            <StatCard item={statItems[2]} />
          </Col>
        )}
      </Row>

      {unpaidCount > 0 && (
        <p className="text-muted small mb-4">
          Open invoice total due: <strong>{formatMoney(unpaidCents, currency)}</strong>
        </p>
      )}

      {upgradeDowngradeNote && <p className="text-muted small mb-2">{upgradeDowngradeNote}</p>}

      <Card className="mb-4">
        <CardBody className="p-0">
          <Row className="g-0">
            <Col xxl={4} xl={5} className="order-xl-1 order-xxl-0">
              <div className="p-3 border-end border-dashed h-100">
                <h4 className="card-title mb-0">Revenue by plan</h4>
                <p className="text-muted fs-xs">Paid invoice amounts in the period, by product.</p>
                <div className="mt-2">
                  {hasPlanRevenue ? (
                    <CustomChartJs
                      type="doughnut"
                      height={300}
                      getOptions={revenueByPlanChart}
                      plugins={[PieController, ArcElement, Tooltip, Legend]}
                    />
                  ) : (
                    <p className="text-muted small py-5 text-center">No per-plan paid revenue in this range.</p>
                  )}
                </div>
              </div>
              <hr className="d-xxl-none border-light m-0" />
            </Col>
            <Col xxl={8} xl={7} className="order-xl-3 order-xxl-1">
              <div className="px-3 py-3">
                <h4 className="card-title">Total revenue</h4>
                <p className="text-muted fs-xs">Paid invoice totals bucketed by the selected range.</p>
                <div dir="ltr" className="mt-2">
                  <CustomChartJs
                    type="bar"
                    height={300}
                    getOptions={totalRevenueChart}
                    plugins={[BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend]}
                  />
                </div>
              </div>
            </Col>
          </Row>
        </CardBody>
      </Card>

      {byPlan.length > 0 && (
        <>
          <h6 className="mb-2">Active subscriptions by plan (current)</h6>
          <div className="table-responsive border rounded mb-4">
            <Table hover size="sm" striped className="table table-custom table-centered table-nowrap mb-0 align-middle">
              <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                <tr className="text-uppercase fs-xxs">
                  <th>Plan</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {byPlan.map((row) => (
                  <tr key={row.productId}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}

      <Row className="g-3 mb-4">
        <Col xxl={6}>
          <Card>
            <CardBody>
              <div className="border-bottom border-dashed pb-3 mb-3">
                <h4 className="card-title mb-0">Recent invoices</h4>
                <p className="text-muted small mb-0">Last 10 paid in this period.</p>
              </div>
              <div className="table-responsive border rounded">
                  <Table hover size="sm" align-middle className="table table-custom table-centered table-nowrap mb-0">
                    <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                      <tr className="text-uppercase fs-xxs">
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Invoice</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.recentPaidInvoices ?? []).map((inv) => (
                        <tr key={inv.id}>
                          <td className="small text-nowrap">{new Date(inv.created * 1000).toLocaleString()}</td>
                          <td className="small">{inv.customerDisplayName}</td>
                          <td className="small">
                            {inv.subscriptionId ? (
                              <Link
                                to={ROUTE_PATHS.adminFinanceSubscriptionPath(inv.subscriptionId)}
                                className="font-monospace"
                              >
                                {inv.number ?? inv.id}
                              </Link>
                            ) : (
                              <span className="font-monospace">{inv.number ?? inv.id}</span>
                            )}
                          </td>
                          <td>{formatMoney(inv.amount_paid, inv.currency)}</td>
                        </tr>
                      ))}
                      {(data.recentPaidInvoices ?? []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-muted text-center py-3">
                            No paid invoices in range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col xxl={6}>
          <Card>
            <CardBody>
              <div className="border-bottom border-dashed pb-3 mb-3">
                <h4 className="card-title mb-0">Recent subscriptions</h4>
                <p className="text-muted small mb-0">Last 10 created in this period.</p>
              </div>
              <div className="table-responsive border rounded">
                  <Table hover size="sm" align-middle className="table table-custom table-centered table-nowrap mb-0">
                    <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                      <tr className="text-uppercase fs-xxs">
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Plan</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {recentSubs.map((row) => (
                        <tr key={row.id}>
                          <td className="small text-nowrap">{new Date(row.created * 1000).toLocaleString()}</td>
                          <td className="small">
                            <Link to={ROUTE_PATHS.adminFinanceSubscriptionPath(row.subscriptionId)}>
                              {row.customerDisplayName}
                            </Link>
                          </td>
                          <td className="small">{row.planName}</td>
                          <td>
                            <Badge bg="secondary" className="text-capitalize">
                              {row.status}
                            </Badge>
                          </td>
                          <td className="text-end small">{formatMoney(row.amountCents, row.currency)}</td>
                        </tr>
                      ))}
                      {recentSubs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-muted text-center py-3">
                            No new subscriptions in range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}

export default FinanceDashboardPage
