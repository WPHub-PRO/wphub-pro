import type { SubscriptionLineDisplay } from '../lineDisplay'
import { Link } from 'react-router'
import { Button, Card, CardBody, CardHeader, Table } from 'react-bootstrap'
import { TbCalendar, TbExternalLink, TbInfoCircle, TbPlayerPause, TbPointFilled } from 'react-icons/tb'

type Inv = {
  id: string | null
  status: string | null
  totalLabel: string
  hostedInvoiceUrl: string | null
}

type Props = {
  subscriptionId: string
  status: string
  statusBadgeClass: string
  secondBadge: { text: string; icon: 'pause' | 'info' } | null
  createdLabel: string
  openStripeHref: string
  lines: SubscriptionLineDisplay[]
  inv: Inv
  invoiceLinkTo: string | null
}

const SubscriptionOrderSummary = ({
  subscriptionId,
  status,
  statusBadgeClass,
  secondBadge,
  createdLabel,
  openStripeHref,
  lines,
  inv,
  invoiceLinkTo,
}: Props) => {
  return (
    <Card>
      <CardHeader className="align-items-start p-4 d-flex flex-wrap justify-content-between gap-3">
        <div>
          <h3 className="mb-1 d-flex fs-xl align-items-center flex-wrap">
            <span>Subscription</span>
            <code className="ms-2 small text-muted align-middle">#{subscriptionId}</code>
          </h3>
          <p className="text-muted mb-3">
            <TbCalendar className="align-middle" /> {createdLabel}
          </p>
          <span className={`badge ${statusBadgeClass} me-1`}>
            <TbPointFilled className="align-middle fs-sm" /> {status}
          </span>
          {secondBadge ? (
            <span className="badge badge-soft-info fs-xxs badge-label me-1">
              {secondBadge.icon === 'pause' ? (
                <TbPlayerPause className="align-middle fs-sm" />
              ) : (
                <TbInfoCircle className="align-middle fs-sm" />
              )}{' '}
              {secondBadge.text}
            </span>
          ) : null}
        </div>
        <div className="ms-auto d-flex flex-wrap gap-1">
          <Button variant="light" className="d-inline-flex align-items-center" href={openStripeHref} target="_blank" rel="noreferrer">
            <TbExternalLink className="me-1" /> Open in Stripe
          </Button>
        </div>
      </CardHeader>
      <CardBody className="px-4">
        <h4 className="fs-sm mb-3">Line items</h4>
        {lines.length === 0 ? (
          <p className="text-muted small mb-0">No line items on this subscription.</p>
        ) : (
          <Table responsive bordered className="table-custom table-nowrap align-middle mb-1">
            <thead className="bg-light align-middle bg-opacity-25 thead-sm">
              <tr className="text-uppercase fs-xxs">
                <th>Item</th>
                <th>Unit price</th>
                <th>QTY</th>
                <th>Interval</th>
                <th className="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((row) => (
                <tr key={row.lineId}>
                  <td>
                    <div className="d-flex">
                      <div className="avatar-md me-3 flex-shrink-0">
                        <span className="avatar-title text-bg-primary-subtle text-primary fs-sm rounded">
                          {row.productName.charAt(0).toUpperCase() || '—'}
                        </span>
                      </div>
                      <div>
                        <h5 className="mb-0 fs-base">
                          <span className="text-reset">{row.productName}</span>
                        </h5>
                        <p className="text-muted mb-0 font-monospace fs-xs">{row.priceId}</p>
                      </div>
                    </div>
                  </td>
                  <td>{row.unitAmountLabel}</td>
                  <td>{row.quantity}</td>
                  <td className="small text-capitalize">{row.intervalLabel}</td>
                  <td className="text-end">{row.lineTotalLabel}</td>
                </tr>
              ))}
              {inv.id ? (
                <tr className="border-top">
                  <td colSpan={4} className="text-end fw-semibold">
                    Latest invoice total
                  </td>
                  <td className="text-end">
                    {inv.totalLabel}
                    {inv.status ? (
                      <span className="d-block text-muted fs-xxs fw-normal mt-1">Status: {inv.status}</span>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        )}
        {inv.id && invoiceLinkTo ? (
          <p className="text-muted small mb-0">
            <Link to={invoiceLinkTo} className="link-primary fw-semibold text-decoration-underline">
              Open invoice in admin
            </Link>
            {inv.hostedInvoiceUrl ? (
              <>
                {' · '}
                <a
                  href={inv.hostedInvoiceUrl}
                  className="link-primary fw-semibold text-decoration-underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Stripe hosted
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </CardBody>
    </Card>
  )
}

export default SubscriptionOrderSummary
