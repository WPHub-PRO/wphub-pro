import CustomChartJs from '@/components/CustomChartJs'
import { useFinanceDashboard } from '@/domains/admin/finance/hooks'
import type { AdminPlanDetailPayload, FinanceDashboardPeriod } from '@/domains/admin/finance/types'
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
import { Alert, ButtonGroup, Button, Card, CardBody, Col, Row, Spinner } from 'react-bootstrap'

const PERIODS: { id: FinanceDashboardPeriod; label: string }[] = [
  { id: 'this_week', label: 'This week' },
  { id: 'month_to_date', label: 'Month to date' },
  { id: 'last_month', label: 'Last month' },
  { id: 'year_to_date', label: 'Year to date' },
  { id: 'last_year', label: 'Last year' },
]

type FinancePlanDetailAnalyticsTabProps = {
  productId: string
  planName: string
  stats: AdminPlanDetailPayload['stats']
  currency: string
}

const FinancePlanDetailAnalyticsTab = ({
  productId,
  planName,
  stats,
  currency,
}: FinancePlanDetailAnalyticsTabProps) => {
  const [period, setPeriod] = useState<FinanceDashboardPeriod>('month_to_date')
  const { data: dashboard, isLoading: dashLoading, error: dashError } = useFinanceDashboard(period)

  const planRevenueCents = useMemo(() => {
    const row = dashboard?.stats?.revenueByPlan?.find((r) => r.productId === productId)
    return row?.revenueCents ?? 0
  }, [dashboard?.stats?.revenueByPlan, productId])

  const subscriptionMixChart = useMemo<() => ChartJSOptionsType>(() => {
    const monthly = stats.subscriptionsMonthly
    const yearly = stats.subscriptionsYearly
    return () => ({
      data: {
        labels: ['Monthly billing', 'Yearly billing'],
        datasets: [
          {
            label: 'Subscriptions',
            data: [monthly, yearly],
            backgroundColor: [getColor('chart-primary'), getColor('chart-alpha')],
            borderColor: 'transparent',
            borderWidth: 1,
            cutout: '55%',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          title: { display: true, text: 'Billing interval mix' },
        },
      },
    })
  }, [stats.subscriptionsMonthly, stats.subscriptionsYearly])

  const periodRevenueChart = useMemo<() => ChartJSOptionsType>(() => {
    const cur = (dashboard?.currency ?? currency).toUpperCase()
    const sym =
      new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? '€'
    const cents = planRevenueCents
    return () => ({
      data: {
        labels: [dashboard?.rangeLabel ?? 'Selected period'],
        datasets: [
          {
            label: `Revenue (${planName})`,
            data: [Math.round(cents) / 100],
            backgroundColor: getColor('chart-primary'),
            borderColor: getColor('chart-primary'),
            borderRadius: 6,
            barThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Paid invoice revenue (this plan)' },
        },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: `Amount (${sym})` } },
        },
      },
    })
  }, [dashboard?.currency, dashboard?.rangeLabel, currency, planName, planRevenueCents])

  return (
    <div>
      <Row className="g-3 mb-3">
        <Col sm={6} md={3}>
          <Card className="border shadow-none h-100">
            <CardBody className="py-3">
              <p className="text-muted fs-xxs text-uppercase fw-semibold mb-1">Active subscriptions</p>
              <p className="fs-4 fw-semibold mb-0">{stats.totalSubscriptions}</p>
            </CardBody>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="border shadow-none h-100">
            <CardBody className="py-3">
              <p className="text-muted fs-xxs text-uppercase fw-semibold mb-1">Est. earnings</p>
              <p className="fs-4 fw-semibold mb-0">{stats.totalEarnings}</p>
            </CardBody>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="border shadow-none h-100">
            <CardBody className="py-3">
              <p className="text-muted fs-xxs text-uppercase fw-semibold mb-1">Upgraded to</p>
              <p className="fs-4 fw-semibold mb-0">{stats.upgradedTo}</p>
            </CardBody>
          </Card>
        </Col>
        <Col sm={6} md={3}>
          <Card className="border shadow-none h-100">
            <CardBody className="py-3">
              <p className="text-muted fs-xxs text-uppercase fw-semibold mb-1">Downgraded</p>
              <p className="fs-4 fw-semibold mb-0">
                {stats.downgradedTo} / {stats.downgradedFrom}
              </p>
              <p className="text-muted fs-xxs mb-0">to / from</p>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <p className="text-muted small mb-0">Finance dashboard period (paid revenue attributed to this product)</p>
        <ButtonGroup size="sm">
          {PERIODS.map((p) => (
            <Button
              key={p.id}
              variant={period === p.id ? 'primary' : 'outline-secondary'}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </ButtonGroup>
      </div>

      {dashError ? <Alert variant="warning">{dashError.message}</Alert> : null}

      <Row className="g-3">
        <Col lg={6}>
          <Card className="shadow-sm h-100">
            <CardBody>
              <CustomChartJs
                type="doughnut"
                height={280}
                getOptions={subscriptionMixChart}
                plugins={[PieController, ArcElement, Tooltip, Legend]}
              />
            </CardBody>
          </Card>
        </Col>
        <Col lg={6}>
          <Card className="shadow-sm h-100">
            <CardBody>
              {dashLoading ? (
                <div className="d-flex justify-content-center py-5">
                  <Spinner animation="border" />
                </div>
              ) : (
                <CustomChartJs
                  type="bar"
                  height={280}
                  getOptions={periodRevenueChart}
                  plugins={[BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend]}
                />
              )}
              <p className="text-muted fs-xxs mb-0 mt-2">
                Revenue from paid invoices in the selected window. Platform-wide time-series per plan is not available
                yet.
              </p>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default FinancePlanDetailAnalyticsTab
