import type { AdminPlanDetailPayload } from '@/domains/admin/finance/types'
import { formatPlanUnix } from '@/views/admin/finance/planDetail/financePlanDetailUtils'
import { Button, Card, CardBody, CardHeader, CardTitle, Form, Spinner } from 'react-bootstrap'
import { MdFlashOff, MdFlashOn } from 'react-icons/md'
import { TbArchive, TbArchiveOff, TbCalendar, TbCreditCard, TbExternalLink, TbEyeOff } from 'react-icons/tb'

type FinancePlanDetailSidebarCardProps = {
  plan: AdminPlanDetailPayload['plan']
  stats: AdminPlanDetailPayload['stats']
  hidden: boolean
  hiddenSaving: boolean
  archiveBusy: boolean
  onHiddenChange: (hidden: boolean) => void
  onArchive: () => void
  onUnarchive: () => void
}

const FinancePlanDetailSidebarCard = ({
  plan,
  stats,
  hidden,
  hiddenSaving,
  archiveBusy,
  onHiddenChange,
  onArchive,
  onUnarchive,
}: FinancePlanDetailSidebarCardProps) => {
  const isActive = plan.status === 'active'
  const stripeHref = plan.stripeLink?.trim()
  const statusLabel = isActive ? 'Active' : 'Archived'

  return (
    <div className="position-sticky align-self-start z-3" style={{ top: '0.75rem' }}>
      <Card className="bg-dark text-white border-secondary border-opacity-25 shadow">
        <CardHeader className="d-flex flex-wrap align-items-start justify-content-between gap-2 border-secondary border-opacity-25 bg-transparent text-white">
          <CardTitle as="h4" className="mb-0 text-white">
            Plan info
          </CardTitle>
          <div className="d-flex flex-column align-items-end text-end flex-shrink-0 ms-auto">
            <div className="d-flex align-items-center gap-1 flex-wrap justify-content-end">
              {isActive ? (
                <MdFlashOn style={{ fontSize: '1.35rem', color: '#22c55e' }} aria-hidden />
              ) : (
                <MdFlashOff style={{ fontSize: '1.35rem', color: 'rgba(255,255,255,0.45)' }} aria-hidden />
              )}
              <span className="fs-xs text-white fw-medium">{statusLabel}</span>
            </div>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          <div className="d-flex align-items-center mb-4">
            <div className="me-2 flex-shrink-0">
              <span
                className="rounded-circle bg-white d-inline-flex align-items-center justify-content-center flex-shrink-0 shadow-sm overflow-hidden"
                style={{ width: 48, height: 48, lineHeight: 0 }}
                aria-hidden
              >
                <TbCreditCard className="text-dark" style={{ fontSize: '1.5rem' }} />
              </span>
            </div>
            <div className="min-w-0 flex-grow-1">
              <h5 className="mb-1 text-truncate text-white" title={plan.name}>
                {plan.name}
              </h5>
              <p className="text-white-50 mb-0 fs-xs text-break">Product ID · {plan.id}</p>
            </div>
          </div>

          <ul className="list-unstyled text-white-50 mb-0">
            <li className="mb-3">
              <div className="d-flex align-items-start gap-2">
                <div className="avatar-xs avatar-img-size fs-24 flex-shrink-0">
                  <span className="avatar-title bg-white bg-opacity-10 text-white fs-sm rounded-circle d-inline-flex align-items-center justify-content-center border border-white border-opacity-10">
                    <TbCalendar />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="fs-xxs text-uppercase text-white-50 mb-0 fw-semibold">Created</p>
                  <span className="link-light fw-medium text-break d-block">{formatPlanUnix(plan.catalogCreated)}</span>
                </div>
              </div>
            </li>
            <li className={stripeHref ? 'mb-3' : 'mb-0'}>
              <div className="d-flex align-items-start gap-2">
                <div className="avatar-xs avatar-img-size fs-24 flex-shrink-0">
                  <span className="avatar-title bg-white bg-opacity-10 text-white fs-sm rounded-circle d-inline-flex align-items-center justify-content-center border border-white border-opacity-10">
                    <TbCalendar />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="fs-xxs text-uppercase text-white-50 mb-0 fw-semibold">Last updated</p>
                  <span className="link-light fw-medium text-break d-block">{formatPlanUnix(plan.catalogUpdated)}</span>
                </div>
              </div>
            </li>
            {stripeHref ? (
              <li className="mb-0">
                <div className="d-flex align-items-start gap-2">
                  <div className="avatar-xs avatar-img-size fs-24 flex-shrink-0">
                    <span className="avatar-title bg-white bg-opacity-10 text-white fs-sm rounded-circle d-inline-flex align-items-center justify-content-center border border-white border-opacity-10">
                      <TbExternalLink />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="fs-xxs text-uppercase text-white-50 mb-0 fw-semibold">Stripe</p>
                    <a
                      href={stripeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-light link-offset-1 fw-medium text-break"
                    >
                      Open in Stripe
                    </a>
                  </div>
                </div>
              </li>
            ) : null}
          </ul>

          <hr className="my-3 border-secondary border-opacity-50" />

          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {isActive ? (
              <Button
                type="button"
                variant="outline-warning"
                size="sm"
                disabled={archiveBusy}
                onClick={onArchive}
                className="d-inline-flex align-items-center gap-1"
              >
                {archiveBusy ? <Spinner animation="border" size="sm" /> : <TbArchive aria-hidden />}
                Archive plan
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline-success"
                size="sm"
                disabled={archiveBusy}
                onClick={onUnarchive}
                className="d-inline-flex align-items-center gap-1"
              >
                {archiveBusy ? <Spinner animation="border" size="sm" /> : <TbArchiveOff aria-hidden />}
                Unarchive plan
              </Button>
            )}
          </div>

          <div className="rounded bg-white bg-opacity-10 border border-white border-opacity-10 p-3 mb-3">
            <p className="fs-xxs text-uppercase text-white-50 fw-semibold mb-2">Subscription totals</p>
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="fs-5 fw-semibold text-white mb-0">{stats.totalSubscriptions}</span>
              <span className="text-white-50 small">active subscriptions</span>
            </div>
            <p className="text-white-50 small mb-1">
              Monthly / yearly: {stats.subscriptionsMonthly} / {stats.subscriptionsYearly}
            </p>
            <p className="text-white-50 small mb-0">
              Est. earnings: <span className="fw-medium text-white">{stats.totalEarnings}</span>
            </p>
          </div>

          <div className="rounded bg-white bg-opacity-10 border border-white border-opacity-10 p-3">
            <p className="fs-xxs text-uppercase text-white-50 fw-semibold mb-2">Pricing visibility</p>
            <Form.Check
              type="switch"
              id="plan-hidden-pricing"
              className="mb-0"
              label={
                <span className="small text-white">
                  <TbEyeOff className="me-1 align-text-bottom" aria-hidden />
                  Hide from pricing tables
                </span>
              }
              checked={hidden}
              disabled={hiddenSaving}
              onChange={(e) => onHiddenChange(e.target.checked)}
            />
            <p className="text-white-50 small mb-0 mt-2">
              Hidden plans stay assignable by admins only.
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

export default FinancePlanDetailSidebarCard
