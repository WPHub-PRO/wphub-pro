import { Card, CardBody, CardHeader, CardTitle } from 'react-bootstrap'
import { TbCreditCard, TbPencil } from 'react-icons/tb'

type Props = {
  paymentMethodLabel: string | null
  invStatus: string | null
}

const SubscriptionBillingPanel = ({ paymentMethodLabel, invStatus }: Props) => {
  return (
    <Card>
      <CardHeader className="d-flex justify-content-between align-items-center border-dashed">
        <CardTitle as="h4">Billing & payment</CardTitle>
        <span
          className="d-inline-flex align-items-center justify-content-center rounded-circle p-1 text-muted"
          style={{ width: 32, height: 32, background: 'var(--ins-light-bg, #f1f3fa)' }}
          title="Read-only in admin"
        >
          <TbPencil className="fs-lg" />
        </span>
      </CardHeader>
      <CardBody>
        <div className="d-flex align-items-center">
          <div className="avatar-sm me-2 d-flex align-items-center justify-content-center text-bg-primary-subtle text-primary rounded">
            <TbCreditCard className="fs-xl" />
          </div>
          <div>
            <h5 className="fs-xs mb-1">{paymentMethodLabel ?? 'No default payment method'}</h5>
            {invStatus ? <p className="text-muted mb-0 fs-xs">Latest invoice: {invStatus}</p> : null}
          </div>
          {invStatus ? (
            <div className="ms-auto">
              <span className="badge bg-success-subtle text-success">{invStatus === 'paid' ? 'Paid' : invStatus}</span>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  )
}

export default SubscriptionBillingPanel
