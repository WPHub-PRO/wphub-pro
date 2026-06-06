import { Card, CardBody, CardHeader, CardTitle } from 'react-bootstrap'
import type { ReactNode } from 'react'

type Row = { label: string; value: string | ReactNode }

type Props = {
  rows: Row[]
  title?: string
}

const SubscriptionInfoCard = ({ rows, title = 'Status & terms' }: Props) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h4">{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {rows.map((r) => (
          <div key={r.label} className="d-flex flex-wrap small border-bottom border-light py-2 gap-2">
            <div className="text-muted flex-grow-0" style={{ minWidth: 120 }}>
              {r.label}
            </div>
            <div className="text-break flex-grow-1 min-w-0">{r.value}</div>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

export default SubscriptionInfoCard
