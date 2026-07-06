import { ROUTE_PATHS } from '@/config/routePaths'
import MediaLibraryImagePickerModal from '@/components/admin/MediaLibraryImagePickerModal'
import { useNotificationContext } from '@/context/useNotificationContext'
import { useAdminCreatePlan, type AdminCreatePlanInput } from '@/domains/admin/finance/hooks'
import { useEffect, useState } from 'react'
import { Alert, Button, Form, InputGroup, Spinner } from 'react-bootstrap'
import Modal from '@/components/ui/AppModal'
import { useNavigate } from 'react-router'

export type FinancePlanCreateModalProps = {
  show: boolean
  onHide: () => void
  /** Pre-filled Stripe metadata `type`. */
  defaultPlanType: 'personal plan' | 'team plan'
}

const emptyForm = (): Omit<AdminCreatePlanInput, 'planType'> => ({
  name: '',
  description: '',
  planFeatures: '',
  imageUrl: '',
  sites_limit: '',
  library_limit: '',
  storage_limit: '',
  seats_included: '',
  monthlyAmount: undefined,
  yearlyAmount: undefined,
  currency: 'eur',
  hidden: false,
  non_sellable: false,
})

const FinancePlanCreateModal = ({ show, onHide, defaultPlanType }: FinancePlanCreateModalProps) => {
  const navigate = useNavigate()
  const { showNotification } = useNotificationContext()
  const createMut = useAdminCreatePlan()

  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [planType, setPlanType] = useState<'personal plan' | 'team plan'>(defaultPlanType)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    if (!show) {
      setLibraryPickerOpen(false)
      return
    }
    setPlanType(defaultPlanType)
    setForm(emptyForm())
  }, [show, defaultPlanType])

  const submit = async () => {
    const name = form.name?.trim() ?? ''
    if (!name) {
      showNotification({ title: 'Plan', message: 'Name is required.', variant: 'warning' })
      return
    }
    if (planType === 'team plan') {
      const seats = form.seats_included?.trim() ?? ''
      if (!seats) {
        showNotification({
          title: 'Team plan',
          message: 'Enter the number of seats included for a team plan.',
          variant: 'warning',
        })
        return
      }
    }
    try {
      const payload: AdminCreatePlanInput = {
        ...form,
        name,
        planType,
        monthlyAmount:
          form.monthlyAmount !== undefined && form.monthlyAmount !== null && String(form.monthlyAmount) !== ''
            ? Number(form.monthlyAmount)
            : undefined,
        yearlyAmount:
          form.yearlyAmount !== undefined && form.yearlyAmount !== null && String(form.yearlyAmount) !== ''
            ? Number(form.yearlyAmount)
            : undefined,
      }
      const { productId } = await createMut.mutateAsync(payload)
      showNotification({ title: 'Created', message: 'Plan was created in Stripe.', variant: 'success' })
      onHide()
      navigate(ROUTE_PATHS.adminFinancePlanPath(productId))
    } catch (e) {
      showNotification({
        title: 'Create failed',
        message: e instanceof Error ? e.message : 'Unknown error',
        variant: 'danger',
      })
    }
  }

  return (
    <>
    <Modal show={show} onHide={onHide} size="lg" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>Create plan</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="light" className="small border py-2 mb-3">
          Plans are Stripe products. Limits and features are stored in product metadata (max 500 characters for plan
          features).
        </Alert>
        <Form.Group className="mb-2">
          <Form.Label>Type</Form.Label>
          <Form.Select
            value={planType}
            onChange={(e) => setPlanType(e.target.value as 'personal plan' | 'team plan')}
            disabled={createMut.isPending}
          >
            <option value="personal plan">Personal plan</option>
            <option value="team plan">Team plan</option>
          </Form.Select>
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Name *</Form.Label>
          <Form.Control
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            disabled={createMut.isPending}
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Description</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            disabled={createMut.isPending}
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Plan features (metadata, max 500 chars)</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            maxLength={500}
            value={form.planFeatures}
            onChange={(e) => setForm((f) => ({ ...f, planFeatures: e.target.value }))}
            disabled={createMut.isPending}
          />
          <Form.Text muted>{(form.planFeatures ?? '').length} / 500</Form.Text>
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Image URL (HTTPS)</Form.Label>
          <InputGroup>
            <Form.Control
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder="https://…"
              disabled={createMut.isPending}
            />
            <Button
              type="button"
              variant="outline-secondary"
              disabled={createMut.isPending}
              onClick={() => setLibraryPickerOpen(true)}
            >
              Select from library
            </Button>
          </InputGroup>
          <Form.Text muted>Or paste a public image URL for the plan in Stripe.</Form.Text>
        </Form.Group>
        {planType === 'team plan' ? (
          <Form.Group className="mb-2">
            <Form.Label>Seats included *</Form.Label>
            <Form.Control
              type="number"
              min={1}
              value={form.seats_included}
              onChange={(e) => setForm((f) => ({ ...f, seats_included: e.target.value }))}
              disabled={createMut.isPending}
            />
          </Form.Group>
        ) : null}
        <div className="row g-2 mb-2">
          <div className="col-md-4">
            <Form.Group>
              <Form.Label className="small">Sites limit</Form.Label>
              <Form.Control
                value={form.sites_limit}
                onChange={(e) => setForm((f) => ({ ...f, sites_limit: e.target.value }))}
                disabled={createMut.isPending}
              />
            </Form.Group>
          </div>
          <div className="col-md-4">
            <Form.Group>
              <Form.Label className="small">Library limit</Form.Label>
              <Form.Control
                value={form.library_limit}
                onChange={(e) => setForm((f) => ({ ...f, library_limit: e.target.value }))}
                disabled={createMut.isPending}
              />
            </Form.Group>
          </div>
          <div className="col-md-4">
            <Form.Group>
              <Form.Label className="small">Storage limit</Form.Label>
              <Form.Control
                value={form.storage_limit}
                onChange={(e) => setForm((f) => ({ ...f, storage_limit: e.target.value }))}
                disabled={createMut.isPending}
              />
            </Form.Group>
          </div>
        </div>
        <div className="row g-2 mb-2 align-items-end">
          <div className="col-md-3">
            <Form.Group>
              <Form.Label className="small">Monthly price ({form.currency?.toUpperCase() ?? 'EUR'})</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                min={0}
                value={form.monthlyAmount ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    monthlyAmount: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                disabled={createMut.isPending}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group>
              <Form.Label className="small">Yearly price</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                min={0}
                value={form.yearlyAmount ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    yearlyAmount: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
                disabled={createMut.isPending}
              />
            </Form.Group>
          </div>
          <div className="col-md-3">
            <Form.Group>
              <Form.Label className="small">Currency</Form.Label>
              <Form.Control
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                disabled={createMut.isPending}
              />
            </Form.Group>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-3 mb-2">
          <Form.Check
            type="switch"
            id="create-hidden"
            label="Hidden"
            checked={!!form.hidden}
            onChange={(e) => setForm((f) => ({ ...f, hidden: e.target.checked }))}
            disabled={createMut.isPending}
          />
          <Form.Check
            type="switch"
            id="create-nonsell"
            label="Non-sellable"
            checked={!!form.non_sellable}
            onChange={(e) => setForm((f) => ({ ...f, non_sellable: e.target.checked }))}
            disabled={createMut.isPending}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={createMut.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={createMut.isPending}>
          {createMut.isPending ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Creating…
            </>
          ) : (
            'Create in Stripe'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
    <MediaLibraryImagePickerModal
      show={libraryPickerOpen}
      onHide={() => setLibraryPickerOpen(false)}
      onSelect={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
    />
    </>
  )
}

export default FinancePlanCreateModal
