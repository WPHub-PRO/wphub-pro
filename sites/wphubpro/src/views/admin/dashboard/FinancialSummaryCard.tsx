import ComponentCard from '@/components/cards/ComponentCard';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAdminDashboardFinancialSummary } from '@/domains/admin-dashboard';
import { Button, Col, Row, Spinner } from 'react-bootstrap';
import CountUp from 'react-countup';
import { TbCoin, TbRepeat } from 'react-icons/tb';
import { Link } from 'react-router';
import { formatMoneyFromCents } from '@/views/admin/dashboard/formatMoney';

export default function FinancialSummaryCard() {
  const fin = useAdminDashboardFinancialSummary();
  const mrrLabel = formatMoneyFromCents(fin.mrrCents, fin.currency);

  return (
    <ComponentCard
      title="Financial snapshot"
      className="admin-dashboard-card h-100 w-100"
      fillColumnHeight
      bodyClassName="admin-dashboard-card-body d-flex flex-column justify-content-center"
      headerActions={
        <Button as={Link} to={ROUTE_PATHS.ADMIN_FINANCE_DASHBOARD} variant="outline-primary" size="sm">
          Full finance dashboard
        </Button>
      }
    >
      {fin.isLoading ? (
        <div className="d-flex justify-content-center py-4">
          <Spinner animation="border" size="sm" variant="primary" />
        </div>
      ) : fin.isError ? (
        <p className="text-muted small mb-0">
          Stripe summary unavailable. Open the finance dashboard or check `stripe-api` configuration.
        </p>
      ) : (
        <>
          <Row className="g-3 mb-2">
            <Col sm={6}>
              <div className="admin-dashboard-stat-tile border rounded p-2 p-sm-3 h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <p className="text-muted small mb-1">MRR (approx.)</p>
                    <h4 className="mb-0 fw-semibold">{mrrLabel}</h4>
                  </div>
                  <span className="avatar-title bg-primary-subtle text-primary rounded-circle fs-20 d-inline-flex p-2">
                    <TbCoin />
                  </span>
                </div>
              </div>
            </Col>
            <Col sm={6}>
              <div className="admin-dashboard-stat-tile border rounded p-2 p-sm-3 h-100">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <p className="text-muted small mb-1">Active subscriptions</p>
                    <h4 className="mb-0 fw-semibold">
                      {fin.activeSubs == null ? (
                        '—'
                      ) : (
                        <CountUp end={fin.activeSubs} duration={0.8} preserveValue />
                      )}
                    </h4>
                  </div>
                  <span className="avatar-title bg-info-subtle text-info rounded-circle fs-20 d-inline-flex p-2">
                    <TbRepeat />
                  </span>
                </div>
              </div>
            </Col>
          </Row>
          <p className="text-muted small mb-0">
            Basic KPIs only — revenue charts, invoices, and plan analytics live on the finance dashboard.
          </p>
        </>
      )}
    </ComponentCard>
  );
}
