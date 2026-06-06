import { Button, Card, CardBody, CardHeader, CardTitle, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { TbBan, TbPlayerPause, TbPlayerPlay, TbPlayerSkipForward } from 'react-icons/tb'

type Props = {
  busy: boolean
  status: string
  paused: boolean
  onCancelAtEnd: () => void
  onCancelNow: () => void
  onPause: () => void
  onResume: () => void
}

const SubscriptionSidebarActions = ({
  busy,
  status,
  paused,
  onCancelAtEnd,
  onCancelNow,
  onPause,
  onResume,
}: Props) => {
  const isCanceled = status === 'canceled' || status === 'cancelled'

  return (
    <Card>
      <CardHeader className="d-flex justify-content-between align-items-center border-dashed py-3">
        <CardTitle as="h4" className="mb-0 fs-base">
          Actions
        </CardTitle>
      </CardHeader>
      <CardBody className="pt-3">
        <p className="text-muted small mb-3">
          Changes apply in Stripe via <code className="small">POST /admin/subscriptions/:id/actions</code>.
        </p>
        <div className="d-flex flex-wrap gap-2 justify-content-center justify-content-xl-start">
          <OverlayTrigger placement="top" overlay={<Tooltip id="sub-act-cancel-end">Cancel at period end</Tooltip>}>
            <Button
              variant="light"
              size="sm"
              className="btn-icon rounded-circle text-danger"
              disabled={busy || isCanceled}
              onClick={onCancelAtEnd}
              aria-label="Cancel at period end"
            >
              <TbPlayerSkipForward className="fs-lg" />
            </Button>
          </OverlayTrigger>
          <OverlayTrigger
            placement="top"
            overlay={<Tooltip id="sub-act-cancel-now">Cancel subscription immediately</Tooltip>}
          >
            <Button
              variant="danger"
              size="sm"
              className="btn-icon rounded-circle"
              disabled={busy || isCanceled}
              onClick={onCancelNow}
              aria-label="Cancel subscription now"
            >
              <TbBan className="fs-lg" />
            </Button>
          </OverlayTrigger>
          <OverlayTrigger placement="top" overlay={<Tooltip id="sub-act-pause">Pause collection</Tooltip>}>
            <Button
              variant="light"
              size="sm"
              className="btn-icon rounded-circle text-warning"
              disabled={busy || paused || isCanceled}
              onClick={onPause}
              aria-label="Pause collection"
            >
              <TbPlayerPause className="fs-lg" />
            </Button>
          </OverlayTrigger>
          <OverlayTrigger placement="top" overlay={<Tooltip id="sub-act-resume">Resume billing</Tooltip>}>
            <Button
              variant="light"
              size="sm"
              className="btn-icon rounded-circle text-success"
              disabled={busy || !paused || isCanceled}
              onClick={onResume}
              aria-label="Resume billing"
            >
              <TbPlayerPlay className="fs-lg" />
            </Button>
          </OverlayTrigger>
        </div>
      </CardBody>
    </Card>
  )
}

export default SubscriptionSidebarActions
