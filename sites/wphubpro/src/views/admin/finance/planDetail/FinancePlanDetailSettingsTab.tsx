import MediaLibraryImagePickerModal from '@/components/admin/MediaLibraryImagePickerModal'
import type { AdminPlanDetailPayload } from '@/domains/admin/finance/types'
import {
  PLAN_SETTINGS_SECTIONS,
  PLAN_TYPE_OPTIONS,
  type PlanSettingsSectionKey,
} from '@/views/admin/finance/planDetail/financePlanDetailUtils'
import { useState } from 'react'
import { Badge, Button, Col, Form, InputGroup, Nav, Row, Spinner, Table } from 'react-bootstrap'

export type FinancePlanDetailSettingsForm = {
  name: string
  description: string
  imageUrl: string
  planFeatures: string
  planType: string
  sitesLimit: string
  libraryLimit: string
  storageLimit: string
  seatsIncluded: string
  nonSellable: boolean
}

type FinancePlanDetailSettingsTabProps = {
  productId: string
  plan: AdminPlanDetailPayload['plan']
  form: FinancePlanDetailSettingsForm
  onFormChange: (patch: Partial<FinancePlanDetailSettingsForm>) => void
  saving: boolean
  createPricePending: boolean
  setPriceActivePending: boolean
  onSave: () => void
  onCreatePrice: (input: { amount: number; interval: 'month' | 'year' }) => void
  onDeactivatePrice: (priceId: string) => void
}

const FinancePlanDetailSettingsTab = ({
  productId,
  plan,
  form,
  onFormChange,
  saving,
  createPricePending,
  setPriceActivePending,
  onSave,
  onCreatePrice,
  onDeactivatePrice,
}: FinancePlanDetailSettingsTabProps) => {
  const [section, setSection] = useState<PlanSettingsSectionKey>('details')
  const [newAmount, setNewAmount] = useState('')
  const [newInterval, setNewInterval] = useState<'month' | 'year'>('month')
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)

  const isTeamPlan = form.planType === 'team plan'

  return (
    <>
      <Row className="g-3">
        <Col md={3} lg={3} xl={2}>
          <Nav variant="pills" className="flex-column gap-1 plan-detail-settings-nav">
            {PLAN_SETTINGS_SECTIONS.map((s) => (
              <Nav.Item key={s.key}>
                <Nav.Link
                  active={section === s.key}
                  href="#"
                  className="text-start"
                  onClick={(e) => {
                    e.preventDefault()
                    setSection(s.key)
                  }}
                >
                  {s.label}
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
        </Col>
        <Col md={9} lg={9} xl={10}>
          {section === 'details' ? (
            <Row className="g-2">
              <Col md={6}>
                <Form.Label className="small">Plan type</Form.Label>
                <Form.Select
                  size="sm"
                  value={form.planType}
                  onChange={(e) => onFormChange({ planType: e.target.value })}
                >
                  {PLAN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={6}>
                <Form.Label className="small">Name</Form.Label>
                <Form.Control
                  size="sm"
                  value={form.name}
                  onChange={(e) => onFormChange({ name: e.target.value })}
                />
              </Col>
              <Col xs={12}>
                <Form.Label className="small">Image URL (HTTPS)</Form.Label>
                <InputGroup size="sm">
                  <Form.Control
                    value={form.imageUrl}
                    onChange={(e) => onFormChange({ imageUrl: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={() => setLibraryPickerOpen(true)}
                  >
                    Select from library
                  </Button>
                </InputGroup>
                {form.imageUrl.trim() ? (
                  <img
                    src={form.imageUrl.trim()}
                    alt=""
                    className="rounded border bg-light mt-2"
                    style={{ maxWidth: 160, maxHeight: 120, objectFit: 'contain' }}
                  />
                ) : null}
              </Col>
              <Col xs={12}>
                <Form.Label className="small">Description</Form.Label>
                <Form.Control
                  size="sm"
                  as="textarea"
                  rows={2}
                  value={form.description}
                  onChange={(e) => onFormChange({ description: e.target.value })}
                />
              </Col>
              <Col xs={12}>
                <Form.Label className="small">Features (metadata, max 500 chars)</Form.Label>
                <Form.Control
                  size="sm"
                  as="textarea"
                  rows={4}
                  maxLength={500}
                  value={form.planFeatures}
                  onChange={(e) => onFormChange({ planFeatures: e.target.value })}
                />
                <Form.Text muted>{form.planFeatures.length} / 500</Form.Text>
              </Col>
              {isTeamPlan ? (
                <Col md={6}>
                  <Form.Label className="small">Seats included</Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    min={1}
                    value={form.seatsIncluded}
                    onChange={(e) => onFormChange({ seatsIncluded: e.target.value })}
                  />
                </Col>
              ) : null}
              <Col xs={12}>
                <Form.Check
                  type="switch"
                  id="plan-nonsell-settings"
                  label="Non-sellable"
                  checked={form.nonSellable}
                  onChange={(e) => onFormChange({ nonSellable: e.target.checked })}
                />
              </Col>
            </Row>
          ) : null}

          {section === 'limits' ? (
            <Row className="g-2">
              <Col md={4}>
                <Form.Label className="small">Library limit</Form.Label>
                <Form.Control
                  size="sm"
                  value={form.libraryLimit}
                  onChange={(e) => onFormChange({ libraryLimit: e.target.value })}
                />
              </Col>
              <Col md={4}>
                <Form.Label className="small">Sites limit</Form.Label>
                <Form.Control
                  size="sm"
                  value={form.sitesLimit}
                  onChange={(e) => onFormChange({ sitesLimit: e.target.value })}
                />
              </Col>
              <Col md={4}>
                <Form.Label className="small">Storage limit</Form.Label>
                <Form.Control
                  size="sm"
                  value={form.storageLimit}
                  onChange={(e) => onFormChange({ storageLimit: e.target.value })}
                />
              </Col>
              <Col xs={12}>
                <p className="text-muted small mb-0">
                  Leave blank for unlimited. Values are stored in Stripe product metadata.
                </p>
              </Col>
            </Row>
          ) : null}

          {section === 'pricing' ? (
            <>
              <p className="small text-muted">
                Amounts are fixed per Stripe price. Add a new recurring price to change amounts; deactivate obsolete
                prices.
              </p>
              <Row className="g-2 mb-3 align-items-end">
                <Col xs={4} md={2}>
                  <Form.Label className="small">
                    Amount ({plan.currency.toUpperCase()}, major units)
                  </Form.Label>
                  <Form.Control
                    size="sm"
                    type="number"
                    step="0.01"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </Col>
                <Col xs={4} md={2}>
                  <Form.Label className="small">Interval</Form.Label>
                  <Form.Select
                    size="sm"
                    value={newInterval}
                    onChange={(e) => setNewInterval(e.target.value as 'month' | 'year')}
                  >
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </Form.Select>
                </Col>
                <Col xs="auto">
                  <Button
                    size="sm"
                    disabled={!newAmount || createPricePending}
                    onClick={() => {
                      const amount = parseFloat(newAmount)
                      if (!Number.isFinite(amount) || amount <= 0) return
                      onCreatePrice({ amount, interval: newInterval })
                      setNewAmount('')
                    }}
                  >
                    {createPricePending ? <Spinner animation="border" size="sm" /> : 'Add price'}
                  </Button>
                </Col>
              </Row>
              <div className="table-responsive border rounded">
                <Table
                  hover
                  size="sm"
                  className="table table-custom table-centered table-nowrap mb-0 align-middle"
                >
                  <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                    <tr className="text-uppercase fs-xxs">
                      <th>Price ID</th>
                      <th>Amount</th>
                      <th>Interval</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{renderPriceRows(plan, setPriceActivePending, onDeactivatePrice)}</tbody>
                </Table>
              </div>
            </>
          ) : null}

          {section !== 'pricing' ? (
            <div className="mt-3 pt-3 border-top">
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          ) : (
            <div className="mt-3 pt-3 border-top">
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Saving…
                  </>
                ) : (
                  'Save plan metadata'
                )}
              </Button>
            </div>
          )}
        </Col>
      </Row>

      <MediaLibraryImagePickerModal
        show={libraryPickerOpen}
        onHide={() => setLibraryPickerOpen(false)}
        onSelect={(url) => onFormChange({ imageUrl: url })}
      />
    </>
  )
}

function renderPriceRows(
  plan: AdminPlanDetailPayload['plan'],
  setPriceActivePending: boolean,
  onDeactivatePrice: (priceId: string) => void,
) {
  const fromApi = (plan.allPrices ?? []).filter((r) => r.interval === 'month' || r.interval === 'year')
  const priceRows =
    fromApi.length > 0
      ? [...fromApi].sort((a, b) => {
          if (a.active !== b.active) return a.active === false ? 1 : -1
          if (a.interval !== b.interval) return a.interval === 'month' ? -1 : 1
          return a.id.localeCompare(b.id)
        })
      : [
          ...(plan.monthlyPriceId
            ? [
                {
                  id: plan.monthlyPriceId,
                  amount: plan.monthlyPrice,
                  interval: 'month' as const,
                  active: true,
                },
              ]
            : []),
          ...(plan.yearlyPriceId
            ? [
                {
                  id: plan.yearlyPriceId,
                  amount: plan.yearlyPrice,
                  interval: 'year' as const,
                  active: true,
                },
              ]
            : []),
        ]

  if (priceRows.length === 0) {
    return (
      <tr>
        <td colSpan={5} className="text-muted small">
          No recurring prices. Add one above.
        </td>
      </tr>
    )
  }

  return priceRows.map((row) => (
    <tr key={row.id}>
      <td className="font-monospace small">{row.id}</td>
      <td>
        {row.amount} <span className="text-uppercase text-muted small">{plan.currency}</span>
      </td>
      <td className="text-capitalize">{row.interval}</td>
      <td>
        {row.active === false ? <Badge bg="secondary">Inactive</Badge> : <Badge bg="success">Active</Badge>}
      </td>
      <td>
        {row.active !== false ? (
          <Button
            size="sm"
            variant="outline-danger"
            disabled={setPriceActivePending}
            onClick={() => {
              if (!window.confirm('Deactivate this price in Stripe?')) return
              onDeactivatePrice(row.id)
            }}
          >
            Deactivate
          </Button>
        ) : (
          <span className="text-muted small">—</span>
        )}
      </td>
    </tr>
  ))
}

export default FinancePlanDetailSettingsTab
