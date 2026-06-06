import { Card, CardBody, CardHeader, CardTitle, Table } from 'react-bootstrap'

type Entry = { key: string; value: string }

type Props = {
  entries: Entry[]
}

const SubscriptionMetadataCard = ({ entries }: Props) => {
  if (entries.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h4">Metadata</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="table-responsive">
          <Table className="table table-custom table-centered align-middle table-sm mb-0">
            <tbody>
              {entries.map((m) => (
                <tr key={m.key}>
                  <td className="text-muted font-monospace text-nowrap" style={{ width: '35%' }}>
                    {m.key}
                  </td>
                  <td className="text-break">{m.value}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>
  )
}

export default SubscriptionMetadataCard
