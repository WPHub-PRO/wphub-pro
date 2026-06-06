import { Card, CardBody, CardHeader, CardTitle } from 'react-bootstrap'

type Props = {
  title: string
  name: string | null
  addressLines: string | null
  phone: string | null
  email: string | null
  badge: string | null
}

const SubscriptionAddressPanel = ({ title, name, addressLines, phone, email, badge }: Props) => {
  return (
    <Card>
      <CardHeader className="d-flex justify-content-between align-items-center border-dashed">
        <CardTitle as="h4">{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {addressLines || name || phone || email ? (
          <div className="d-flex align-items-start my-0">
            <div className="flex-grow-1">
              {name ? <h5 className="mb-2 fs-base">{name}</h5> : null}
              {addressLines ? (
                <p className="text-muted mb-2 mb-md-2 small" style={{ whiteSpace: 'pre-line' }}>
                  {addressLines}
                </p>
              ) : null}
              {phone || email ? (
                <p className="mb-0 text-muted small">
                  {phone ? (
                    <>
                      <strong>Phone:</strong> {phone}
                    </>
                  ) : null}
                  {phone && email ? <br /> : null}
                  {email ? (
                    <>
                      <strong>Email:</strong> {email}
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
            {badge ? (
              <div className="ms-auto flex-shrink-0">
                <span className="badge bg-success-subtle text-success text-wrap">{badge}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted small mb-0">No billing address on file in Stripe for this customer.</p>
        )}
      </CardBody>
    </Card>
  )
}

export default SubscriptionAddressPanel
