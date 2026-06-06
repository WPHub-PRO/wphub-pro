import { Card, CardBody, CardHeader, CardTitle } from 'react-bootstrap'
import { TbMail, TbPhone } from 'react-icons/tb'
import { generateInitials } from '@/helpers/casing'

type Props = {
  name: string | null
  email: string | null
  phone: string | null
  sinceLabel: string | null
  customerId: string | null
  balanceLine: string | null
}

const SubscriptionCustomerPanel = ({
  name,
  email,
  phone,
  sinceLabel,
  customerId,
  balanceLine,
}: Props) => {
  const displayName = name?.trim() || email || '—'
  const initial = (displayName !== '—' ? generateInitials(displayName) : '?').slice(0, 2).toUpperCase() || '—'

  return (
    <Card>
      <CardHeader className="d-flex justify-content-between align-items-center border-dashed">
        <CardTitle as="h4">Customer</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="d-flex align-items-center mb-4">
          <div className="me-2">
            <div className="avatar-lg rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center border">
              <span className="fw-bold fs-5">{initial}</span>
            </div>
          </div>
          <div>
            <h5 className="mb-1 d-flex align-items-center flex-wrap">{displayName}</h5>
            {sinceLabel ? <p className="text-muted mb-0 small">Since {sinceLabel}</p> : null}
            {customerId ? (
              <p className="text-muted small font-monospace text-break mb-0">{customerId}</p>
            ) : null}
            {balanceLine ? <p className="text-muted small mb-0 mt-1">{balanceLine}</p> : null}
          </div>
        </div>
        <ul className="list-unstyled text-muted mb-0">
          {email ? (
            <li className="mb-2">
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs avatar-img-size fs-24">
                  <span className="avatar-title text-bg-light fs-sm rounded-circle">
                    <TbMail />
                  </span>
                </div>
                <h5 className="fs-base mb-0 fw-medium text-break">
                  <a className="link-reset" href={`mailto:${email}`}>
                    {email}
                  </a>
                </h5>
              </div>
            </li>
          ) : null}
          {phone ? (
            <li>
              <div className="d-flex align-items-center gap-2">
                <div className="avatar-xs avatar-img-size fs-24">
                  <span className="avatar-title text-bg-light fs-sm rounded-circle">
                    <TbPhone />
                  </span>
                </div>
                <h5 className="fs-base mb-0 fw-medium">
                  <a className="link-reset" href={`tel:${phone}`}>
                    {phone}
                  </a>
                </h5>
              </div>
            </li>
          ) : null}
        </ul>
        {!email && !phone && (
          <p className="text-muted small mb-0">No contact details on the Stripe customer object.</p>
        )}
      </CardBody>
    </Card>
  )
}

export default SubscriptionCustomerPanel
