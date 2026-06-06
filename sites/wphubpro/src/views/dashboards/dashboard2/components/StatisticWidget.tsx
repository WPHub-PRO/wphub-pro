import { WPHUB_ACCENT_ORANGE, WPHUB_ACCENT_ORANGE_SUBTLE_BG } from '@/lib/wphubAccent'
import { Card, CardBody, ProgressBar } from 'react-bootstrap'
import type { StatisticType } from '@/views/dashboards/dashboard2/statisticTypes'

const StatisticWidget = ({ item }: { item: StatisticType }) => {
  const { title, progress, icon: Icon, subtitle, variant, count } = item
  const isOrange = variant === 'orange'

  return (
    <Card>
      <CardBody>
        <div className="d-flex justify-content-between align-items-start">
          <div className="avatar avatar-lg flex-shrink-0">
            <span
              className={
                isOrange
                  ? 'avatar-title rounded fs-24'
                  : `avatar-title bg-${variant}-subtle text-${variant} rounded fs-24`
              }
              style={
                isOrange
                  ? { backgroundColor: WPHUB_ACCENT_ORANGE_SUBTLE_BG, color: WPHUB_ACCENT_ORANGE }
                  : undefined
              }
            >
              <Icon />
            </span>
          </div>
          <div className="text-end">
            <h4 className="mb-0">{count}</h4>
            <p className="mb-0 text-muted">{title}</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="d-flex justify-content-between mb-1">
            <span className="text-muted fs-xs fw-semibold">{subtitle}</span>
            <span className="text-muted">{progress}%</span>
          </div>
          {isOrange ? (
            <div className="progress" style={{ height: 6 }}>
              <div
                className="progress-bar"
                role="progressbar"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: WPHUB_ACCENT_ORANGE }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          ) : (
            <ProgressBar now={progress} variant={variant} style={{ height: '6px' }} />
          )}
        </div>
      </CardBody>
    </Card>
  )
}

export default StatisticWidget
