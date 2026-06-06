import { Card, CardBody } from 'react-bootstrap'
import type { IconType } from 'react-icons'
import CountUp from 'react-countup'

export type StatCardType = {
  id: number
  title: string
  value: number
  suffix?: string
  prefix?: string
  icon: IconType
  iconBg?: string
}

const StatCard = ({ item }: { item: StatCardType }) => {
  const { title, iconBg, icon: Icon, prefix, suffix, value } = item
  return (
    <Card>
      <CardBody>
        <div className="d-flex justify-content-between align-items-center">
          <div className="avatar fs-60 avatar-img-size flex-shrink-0">
            <span className={`avatar-title bg-${iconBg}-subtle text-${iconBg} rounded-circle fs-24`}>
              <Icon />
            </span>
          </div>
          <div className="text-end">
            <h3 className="mb-2 fw-normal">
              <span>
                <CountUp end={value} suffix={suffix} prefix={prefix} />
              </span>
            </h3>
            <p className="mb-0 text-muted">
              <span>{title}</span>
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

export default StatCard
