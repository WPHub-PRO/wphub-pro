import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useDashboardNav } from '@/context/DashboardNavContext'
import { useAuth } from '@/domains/auth'
import { useEffect } from 'react'
import { Button, Card, Col, Container, Row } from 'react-bootstrap'
import { useNavigate } from 'react-router'

/** Placeholder until the full admin dashboard is implemented. */
const AdminDashboardPage = () => {
  const { isAdmin } = useAuth()
  const { mode } = useDashboardNav()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true })
      return
    }
    if (mode !== 'admin') {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true })
    }
  }, [isAdmin, mode, navigate])

  if (!isAdmin || mode !== 'admin') {
    return null
  }

  return (
    <Container fluid>
      <PageBreadcrumb
        title="Admin dashboard"
        subtitle="Admin"
        titleEnd={<DocHelpButton contextKey="admin:dashboard" />}
      />
      <Row>
        <Col>
          <Card>
            <Card.Body>
              <Card.Text className="text-muted mb-3">
                This area is for platform admins. Choose <strong>Admin</strong> in the workspace switcher, then use the sidebar for Users, Platform settings, or Finance.
              </Card.Text>
              <Button variant="primary" size="sm" onClick={() => navigate(ROUTE_PATHS.ADMIN_FINANCE_DASHBOARD)}>
                Open Finance admin
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}

export default AdminDashboardPage
