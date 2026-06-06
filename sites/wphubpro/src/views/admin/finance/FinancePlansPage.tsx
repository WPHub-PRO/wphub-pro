import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { useState } from 'react'
import Nav from 'react-bootstrap/Nav'
import Tab from 'react-bootstrap/Tab'
import FinancePlanCreateModal from '@/views/admin/finance/FinancePlanCreateModal'
import FinancePlansListTab from '@/views/admin/finance/FinancePlansListTab'

type PlansTabKey = 'personal' | 'team'

const FinancePlansPage = () => {
  const [tab, setTab] = useState<PlansTabKey>('personal')
  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultType, setCreateDefaultType] = useState<'personal plan' | 'team plan'>('personal plan')

  const openCreate = (planType: 'personal plan' | 'team plan') => {
    setCreateDefaultType(planType)
    setCreateOpen(true)
  }

  return (
    <>
      <PageBreadcrumb
        title="Plans"
        subtitle="Finance"
        titleEnd={<DocHelpButton contextKey="admin:finance:plans" />}
      />
      <p className="text-muted small mb-3">Stripe catalog · personal vs team</p>
      <Tab.Container activeKey={tab} onSelect={(k) => setTab((k as PlansTabKey) || 'personal')}>
        <Nav variant="tabs" className="mb-0 flex-nowrap" role="tablist">
          <Nav.Item>
            <Nav.Link eventKey="personal" role="tab">
              Personal plans
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="team" role="tab">
              Team plans
            </Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content>
          <Tab.Pane eventKey="personal" className="border-0 p-0" mountOnEnter>
            <FinancePlansListTab filter="personal" onCreateClick={() => openCreate('personal plan')} />
          </Tab.Pane>
          <Tab.Pane eventKey="team" className="border-0 p-0" mountOnEnter>
            <FinancePlansListTab filter="team" onCreateClick={() => openCreate('team plan')} />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
      <FinancePlanCreateModal show={createOpen} onHide={() => setCreateOpen(false)} defaultPlanType={createDefaultType} />
    </>
  )
}

export default FinancePlansPage
