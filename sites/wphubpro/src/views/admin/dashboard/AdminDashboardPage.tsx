import { DocHelpButton } from '@/components/docs/DocHelpButton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useAuth } from '@/domains/auth';
import EmailCard from '@/views/admin/dashboard/EmailCard';
import FinancialSummaryCard from '@/views/admin/dashboard/FinancialSummaryCard';
import HelpdeskTicketsCard from '@/views/admin/dashboard/HelpdeskTicketsCard';
import PlatformStatsCard from '@/views/admin/dashboard/PlatformStatsCard';
import QuickActionsCard from '@/views/admin/dashboard/QuickActionsCard';
import ToolsCard from '@/views/admin/dashboard/ToolsCard';
import { useEffect } from 'react';
import { Col, Container, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router';

const AdminDashboardPage = () => {
  const { isAdmin } = useAuth();
  const { mode } = useDashboardNav();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
      return;
    }
    if (mode !== 'admin') {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
    }
  }, [isAdmin, mode, navigate]);

  if (!isAdmin || mode !== 'admin') {
    return null;
  }

  return (
    <>
      <PageMetaData title="Admin dashboard" />
      <Container fluid className="admin-dashboard-page">
        <PageBreadcrumb
          title="Admin dashboard"
          subtitle="Admin"
          titleEnd={<DocHelpButton contextKey="admin:dashboard" />}
        />

        {/* KPI strip: platform + financial */}
        <Row className="g-2 admin-dashboard-row admin-dashboard-row--kpi">
          <Col xl={8} className="d-flex">
            <PlatformStatsCard />
          </Col>
          <Col xl={4} className="d-flex">
            <FinancialSummaryCard />
          </Col>
        </Row>

        {/* Operations: helpdesk + email (equal height, scroll inside) */}
        <Row className="g-2 admin-dashboard-row admin-dashboard-row--main">
          <Col xl={7} className="d-flex">
            <HelpdeskTicketsCard />
          </Col>
          <Col xl={5} className="d-flex">
            <EmailCard />
          </Col>
        </Row>

        {/* Actions: quick links + admin tools */}
        <Row className="g-2 admin-dashboard-row admin-dashboard-row--actions">
          <Col xl={8} className="d-flex">
            <QuickActionsCard />
          </Col>
          <Col xl={4} className="d-flex">
            <ToolsCard />
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default AdminDashboardPage;
