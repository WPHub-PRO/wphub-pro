import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { Col, Container, Row } from 'react-bootstrap'
import SubscriptionsTable from './components/SubscriptionsTable'

const SubscriptionsPage = () => {
  return (
    <Container fluid className="px-0">
      <PageBreadcrumb
        title="Subscriptions"
        subtitle="Finance"
        titleEnd={<DocHelpButton contextKey="admin:finance:subscriptions" />}
      />

      <Row>
        <Col xs={12}>
          <SubscriptionsTable />
        </Col>
      </Row>
    </Container>
  )
}

export default SubscriptionsPage
