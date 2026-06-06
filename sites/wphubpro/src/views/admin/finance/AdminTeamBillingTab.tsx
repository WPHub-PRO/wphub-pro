import {
  useAdminPersonalBillingConfig,
  useAdminPersonalBillingSave,
  useAdminStripePlansList,
  useAdminTeamBillingConfig,
  useAdminTeamBillingSave,
} from '@/domains/admin/finance/hooks'
import type { PersonalBillingConfig, TeamBillingConfig } from '@/domains/admin/finance/types'
import type { StripePlan } from '@/types'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap'

function normalizeConfig(c: Partial<TeamBillingConfig> | null | undefined): TeamBillingConfig {
  return {
    teamProductId: String(c?.teamProductId ?? ''),
    teamMonthlyPriceId: String(c?.teamMonthlyPriceId ?? ''),
    teamYearlyPriceId: String(c?.teamYearlyPriceId ?? ''),
  }
}

function normalizePersonalConfig(c: Partial<PersonalBillingConfig> | null | undefined): PersonalBillingConfig {
  return {
    freePriceId: String(c?.freePriceId ?? ''),
  }
}

function applyPlanToTeamFields(plan: StripePlan | undefined, prev: TeamBillingConfig): TeamBillingConfig {
  if (!plan) {
    return { ...prev, teamProductId: '', teamMonthlyPriceId: '', teamYearlyPriceId: '' }
  }
  return {
    ...prev,
    teamProductId: plan.id,
    teamMonthlyPriceId: plan.monthlyPriceId ?? '',
    teamYearlyPriceId: plan.yearlyPriceId ?? '',
  }
}

function recurringPriceChoices(plan: StripePlan | undefined, interval: 'month' | 'year') {
  if (!plan) return []
  const rows = (plan.allPrices ?? []).filter((p) => p.interval === interval)
  if (rows.length > 0) {
    return [...rows].sort((a, b) => {
      if (a.active === false && b.active !== false) return 1
      if (a.active !== false && b.active === false) return -1
      return a.amount - b.amount || a.id.localeCompare(b.id)
    })
  }
  const id = interval === 'month' ? plan.monthlyPriceId : plan.yearlyPriceId
  const amount = interval === 'month' ? plan.monthlyPrice : plan.yearlyPrice
  if (id) {
    return [
      {
        id,
        amount,
        currency: plan.currency,
        interval,
        interval_count: 1,
        active: true,
      },
    ]
  }
  return []
}

function priceChoiceLabel(p: { amount: number; currency: string; interval: string; active?: boolean }): string {
  const cur = (p.currency || 'eur').toUpperCase()
  const unit = p.interval === 'year' ? 'year' : 'month'
  const inactive = p.active === false ? ' (inactive)' : ''
  return `${p.amount} ${cur} / ${unit}${inactive}`
}

const AdminTeamBillingTab = () => {
  const { data, isLoading, error, refetch } = useAdminTeamBillingConfig()
  const save = useAdminTeamBillingSave()
  const {
    data: personalData,
    isLoading: personalLoading,
    error: personalError,
    refetch: refetchPersonal,
  } = useAdminPersonalBillingConfig()
  const savePersonal = useAdminPersonalBillingSave()
  const { data: plansData } = useAdminStripePlansList()
  const plans = plansData?.plans ?? []

  const planById = useMemo(() => {
    const m = new Map<string, StripePlan>()
    for (const p of plans) m.set(p.id, p)
    return m
  }, [plans])

  const [form, setForm] = useState<TeamBillingConfig | null>(null)
  const [personalForm, setPersonalForm] = useState<PersonalBillingConfig | null>(null)

  const teamPlan = form?.teamProductId ? planById.get(form.teamProductId) : undefined
  const monthlyChoices = useMemo(() => recurringPriceChoices(teamPlan, 'month'), [teamPlan])
  const yearlyChoices = useMemo(() => recurringPriceChoices(teamPlan, 'year'), [teamPlan])

  useEffect(() => {
    if (data?.config) {
      setForm(normalizeConfig(data.config))
    }
  }, [data])

  useEffect(() => {
    if (personalData?.config) {
      setPersonalForm(normalizePersonalConfig(personalData.config))
    }
  }, [personalData])

  const onSavePersonal = () => {
    if (!personalForm) return
    savePersonal.mutate(
      { config: personalForm },
      {
        onSuccess: (res) => {
          if (res?.config) setPersonalForm(normalizePersonalConfig(res.config))
        },
      },
    )
  }

  const onSave = () => {
    if (!form) return
    save.mutate(
      { config: form },
      {
        onSuccess: (res) => {
          if (res?.config) setForm(normalizeConfig(res.config))
        },
      },
    )
  }

  if (isLoading && !form) {
    return (
      <div className="py-4 text-center">
        <Spinner animation="border" size="sm" />
      </div>
    )
  }

  if (error && !form) {
    return (
      <Alert variant="danger" className="d-flex flex-wrap justify-content-between gap-2 align-items-center">
        <span>{error.message}</span>
        <Button variant="outline-danger" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </Alert>
    )
  }

  if (!form) return null

  return (
    <div className="admin-team-billing-tab">
      <Card className="mb-3 shadow-sm">
        <Card.Body>
          <Card.Title as="h6" className="mb-2">
            Personal free tier (Stripe)
          </Card.Title>
          <p className="text-muted small mb-3">
            Stripe price used as the personal free tier when reconciling accounts in Admin Tools.
          </p>
          {personalError && !personalForm ? (
            <Alert variant="danger" className="py-2 small d-flex flex-wrap justify-content-between gap-2 align-items-center">
              <span>{personalError.message}</span>
              <Button variant="outline-danger" size="sm" onClick={() => void refetchPersonal()}>
                Retry
              </Button>
            </Alert>
          ) : null}
          {savePersonal.isError && (
            <Alert variant="danger" className="py-2 small">
              {savePersonal.error instanceof Error ? savePersonal.error.message : 'Save failed.'}
            </Alert>
          )}
          {savePersonal.isSuccess && (
            <Alert variant="success" className="py-2 small" dismissible onClose={() => savePersonal.reset()}>
              Free tier price saved.
            </Alert>
          )}
          <Form.Group className="mb-2">
            <Form.Label>Free tier price id</Form.Label>
            <Form.Control
              type="text"
              className="font-monospace"
              placeholder="price_…"
              value={personalForm?.freePriceId ?? ''}
              disabled={personalLoading || !personalForm}
              onChange={(e) =>
                setPersonalForm((prev) =>
                  normalizePersonalConfig({ ...(prev ?? { freePriceId: '' }), freePriceId: e.target.value }),
                )
              }
            />
            <Form.Text className="text-muted">
              Recurring Stripe price for the $0 / entry personal plan (same id as in Stripe Dashboard).
            </Form.Text>
          </Form.Group>
          <Button variant="outline-primary" disabled={savePersonal.isPending || personalLoading || !personalForm} onClick={onSavePersonal}>
            {savePersonal.isPending ? 'Saving…' : 'Save free tier price'}
          </Button>
        </Card.Body>
      </Card>

      <Alert variant="info" className="py-2 small mb-3">
        Default Stripe <strong>team monthly / yearly price</strong> ids used when checkout does not send a specific{' '}
        <code>priceId</code> (e.g. legacy flows). Seat limits come from each team plan&apos;s Stripe metadata{' '}
        <code>seats_included</code>. Use <strong>Admin → Teams</strong> to inspect <code>teams</code> rows.
      </Alert>
      <p className="text-muted small mb-3">
        Pick the catalog product and prices that match your <strong>team plan</strong> products in Stripe.
      </p>

      {save.isError && (
        <Alert variant="danger" className="py-2 small">
          {save.error instanceof Error ? save.error.message : 'Save failed.'}
        </Alert>
      )}

      {save.isSuccess && (
        <Alert variant="success" className="py-2 small" dismissible onClose={() => save.reset()}>
          Saved.
        </Alert>
      )}

      <Card className="mb-3 shadow-sm">
        <Card.Body>
          <Card.Title as="h6" className="mb-3">
            Default team plan (Stripe)
          </Card.Title>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Team product</Form.Label>
                <Form.Select
                  value={form.teamProductId}
                  onChange={(e) => {
                    const id = e.target.value
                    setForm((prev) => {
                      if (!prev) return prev
                      const p = planById.get(id)
                      return applyPlanToTeamFields(p, prev)
                    })
                  }}
                >
                  <option value="">— Select product —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">Default team subscription product from the catalog.</Form.Text>
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Team monthly price</Form.Label>
                <Form.Select
                  value={form.teamMonthlyPriceId}
                  disabled={!form.teamProductId || monthlyChoices.length === 0}
                  onChange={(e) => setForm((f) => (f ? { ...f, teamMonthlyPriceId: e.target.value } : f))}
                >
                  <option value="">
                    {!form.teamProductId
                      ? '— Select a product first —'
                      : monthlyChoices.length === 0
                        ? '— No monthly prices —'
                        : '— Choose amount —'}
                  </option>
                  {monthlyChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {priceChoiceLabel(p)}
                    </option>
                  ))}
                  {form.teamMonthlyPriceId &&
                  !monthlyChoices.some((p) => p.id === form.teamMonthlyPriceId) ? (
                    <option value={form.teamMonthlyPriceId}>
                      Saved in config (not in list — refresh catalog or check Stripe)
                    </option>
                  ) : null}
                </Form.Select>
                {form.teamMonthlyPriceId ? (
                  <Form.Text className="text-muted font-monospace small">{form.teamMonthlyPriceId}</Form.Text>
                ) : null}
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label>Team yearly price</Form.Label>
                <Form.Select
                  value={form.teamYearlyPriceId}
                  disabled={!form.teamProductId || yearlyChoices.length === 0}
                  onChange={(e) => setForm((f) => (f ? { ...f, teamYearlyPriceId: e.target.value } : f))}
                >
                  <option value="">
                    {!form.teamProductId
                      ? '— Select a product first —'
                      : yearlyChoices.length === 0
                        ? '— No yearly prices —'
                        : '— Choose amount —'}
                  </option>
                  {yearlyChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {priceChoiceLabel(p)}
                    </option>
                  ))}
                  {form.teamYearlyPriceId && !yearlyChoices.some((p) => p.id === form.teamYearlyPriceId) ? (
                    <option value={form.teamYearlyPriceId}>
                      Saved in config (not in list — refresh catalog or check Stripe)
                    </option>
                  ) : null}
                </Form.Select>
                {form.teamYearlyPriceId ? (
                  <Form.Text className="text-muted font-monospace small">{form.teamYearlyPriceId}</Form.Text>
                ) : null}
              </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Button variant="primary" disabled={save.isPending} onClick={onSave}>
        {save.isPending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}

export default AdminTeamBillingTab
