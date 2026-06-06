import { Card, CardBody, CardHeader, CardTitle } from 'react-bootstrap'
import type { SubscriptionTimelineItem } from '../timelineFromSubscription'

type Props = {
  items: SubscriptionTimelineItem[]
  subscriptionId: string
}

const SubscriptionActivityCard = ({ items, subscriptionId }: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h4">Subscription activity</CardTitle>
      </CardHeader>
      <CardBody className="p-4">
        {items.length === 0 ? (
          <p className="text-muted small mb-0">No timeline events available for this record.</p>
        ) : (
          <div className="timeline">
            {items.map((item, idx) => (
              <div key={`${item.time}-${item.title}-${idx}`} className="timeline-item d-flex align-items-stretch">
                <div className="timeline-time pe-3 text-muted text-nowrap" style={{ minWidth: 120 }}>
                  {item.time}
                </div>
                <div className={`timeline-dot bg-${item.variant}`} />
                <div className={`timeline-content ps-3 ${idx !== items.length - 1 ? 'pb-5' : ''}`}>
                  <h5 className="mb-1 fs-base">{item.title}</h5>
                  <p className="mb-1 text-muted small">{item.description}</p>
                  <p className="mb-1 text-muted fs-xxs">
                    Subscription:{' '}
                    <span className="link-primary fw-semibold text-decoration-underline font-monospace">
                      {subscriptionId}
                    </span>
                  </p>
                  <span className="fw-semibold fs-xxs">By {item.by}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export default SubscriptionActivityCard
