import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import { TabNavLabel } from '@/components/TabNavLabel'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useNotificationContext } from '@/context/useNotificationContext'
import {
  useAdminCreatePrice,
  useAdminPlanDetail,
  useAdminSetPlanActive,
  useAdminSetPriceActive,
  useAdminUpdatePlan,
} from '@/domains/admin/finance/hooks'
import FinancePlanDetailAnalyticsTab from '@/views/admin/finance/planDetail/FinancePlanDetailAnalyticsTab'
import {
  PLAN_DETAIL_TAB_CONFIG,
  PLAN_DETAIL_TAB_KEYS,
  planDetailTabIndexFromKey,
  type PlanDetailTabKey,
} from '@/views/admin/finance/planDetail/financePlanDetailNavTabs'
import FinancePlanDetailSettingsTab, {
  type FinancePlanDetailSettingsForm,
} from '@/views/admin/finance/planDetail/FinancePlanDetailSettingsTab'
import FinancePlanDetailSidebarCard from '@/views/admin/finance/planDetail/FinancePlanDetailSidebarCard'
import FinancePlanDetailSubscriptionsTab from '@/views/admin/finance/planDetail/FinancePlanDetailSubscriptionsTab'
import { limitPayload, metaMap } from '@/views/admin/finance/planDetail/financePlanDetailUtils'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, Col, Container, Nav, Row, Spinner } from 'react-bootstrap'
import { Link, useParams, useSearchParams } from 'react-router'

const FinancePlanDetailPage = () => {
  const { productId } = useParams<{ productId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabIndex = planDetailTabIndexFromKey(searchParams.get('tab'))
  const [tab, setTab] = useState(tabIndex)
  const { showNotification } = useNotificationContext()
  const { data, isLoading, error, refetch } = useAdminPlanDetail(productId)
  const updateMut = useAdminUpdatePlan()
  const setActiveMut = useAdminSetPlanActive()
  const setPriceActiveMut = useAdminSetPriceActive()
  const createPriceMut = useAdminCreatePrice()

  const [form, setForm] = useState<FinancePlanDetailSettingsForm>({
    name: '',
    description: '',
    imageUrl: '',
    planFeatures: '',
    planType: 'personal plan',
    sitesLimit: '',
    libraryLimit: '',
    storageLimit: '',
    seatsIncluded: '',
    nonSellable: false,
  })
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setTab(planDetailTabIndexFromKey(searchParams.get('tab')))
  }, [searchParams])

  useEffect(() => {
    if (!data?.plan) return
    const p = data.plan
    const mm = metaMap(p.metadata)
    const t = (mm.type ?? '').trim().toLowerCase()
    const firstImg = Array.isArray(p.images) && p.images.length > 0 ? String(p.images[0]) : ''
    setForm({
      name: p.name,
      description: p.description || '',
      imageUrl: firstImg,
      planFeatures: mm.plan_features ?? '',
      planType: t === 'team plan' ? 'team plan' : 'personal plan',
      sitesLimit: mm.sites_limit ?? '',
      libraryLimit: mm.library_limit ?? '',
      storageLimit: mm.storage_limit ?? '',
      seatsIncluded: mm.seats_included ?? '',
      nonSellable: mm.non_sellable === 'true',
    })
    setHidden(mm.hidden === 'true')
  }, [data?.plan])

  const setTabKey = (key: PlanDetailTabKey) => {
    const i = PLAN_DETAIL_TAB_KEYS.indexOf(key)
    setTab(i)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', key)
        return next
      },
      { replace: true },
    )
  }

  const notifyOk = (t: string, m: string) =>
    showNotification({ title: t, message: m, variant: 'success', delay: 3000 })
  const notifyErr = (t: string, m: string) =>
    showNotification({ title: t, message: m, variant: 'danger', delay: 5000 })

  const patchForm = useCallback((patch: Partial<FinancePlanDetailSettingsForm>) => {
    setForm((f) => ({ ...f, ...patch }))
  }, [])

  const savePlan = async (hiddenOverride?: boolean) => {
    if (!productId) return
    const isTeamPlan = form.planType === 'team plan'
    if (isTeamPlan && !form.seatsIncluded.trim()) {
      notifyErr('Validation', 'Seats included is required for team plans.')
      return
    }
    const hiddenValue = hiddenOverride ?? hidden
    try {
      const images = form.imageUrl.trim() ? [form.imageUrl.trim()] : []
      await updateMut.mutateAsync({
        productId,
        name: form.name,
        description: form.description,
        sites_limit: limitPayload(form.sitesLimit) as number | string | null,
        library_limit: limitPayload(form.libraryLimit) as number | string | null,
        storage_limit: limitPayload(form.storageLimit) as number | string | null,
        hidden: hiddenValue,
        non_sellable: form.nonSellable,
        type: form.planType,
        plan_features: form.planFeatures,
        seats_included: isTeamPlan
          ? form.seatsIncluded.trim() === ''
            ? null
            : form.seatsIncluded.trim()
          : null,
        images,
      })
      notifyOk('Saved', 'Plan updated in Stripe.')
      void refetch()
    } catch (e) {
      notifyErr('Save', e instanceof Error ? e.message : 'Failed')
    }
  }

  const onHiddenChange = async (next: boolean) => {
    setHidden(next)
    await savePlan(next)
  }

  const archiveProduct = async () => {
    if (!productId || !window.confirm('Archive (deactivate) this product in Stripe?')) return
    try {
      await setActiveMut.mutateAsync({ productId, active: false })
      notifyOk('Archived', 'Product set inactive.')
      void refetch()
    } catch (e) {
      notifyErr('Archive', e instanceof Error ? e.message : 'Failed')
    }
  }

  const restoreProduct = async () => {
    if (!productId) return
    try {
      await setActiveMut.mutateAsync({ productId, active: true })
      notifyOk('Restored', 'Product active again.')
      void refetch()
    } catch (e) {
      notifyErr('Restore', e instanceof Error ? e.message : 'Failed')
    }
  }

  if (!productId) return <p className="text-danger">Missing product id.</p>
  if (isLoading) {
    return (
      <Container fluid>
        <PageBreadcrumb
          title="Plan"
          subtitle="Finance"
          titleEnd={<DocHelpButton contextKey="admin:finance:plan-detail" />}
        />
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" />
        </div>
      </Container>
    )
  }
  if (error || !data?.plan) {
    return (
      <Container fluid>
        <PageBreadcrumb
          title="Plan"
          subtitle="Finance"
          titleEnd={<DocHelpButton contextKey="admin:finance:plan-detail" />}
        />
        <div>
          <p className="text-danger">{error?.message ?? 'Not found'}</p>
          <Link to={ROUTE_PATHS.ADMIN_FINANCE_PLANS}>Back to plans</Link>
        </div>
      </Container>
    )
  }

  const plan = data.plan
  const stats = data.stats
  const subscribers = data.subscribers ?? []

  return (
    <Container fluid>
      <PageBreadcrumb
        title={plan.name}
        subtitle="Finance"
        titleEnd={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            <DocHelpButton contextKey="admin:finance:plan-detail" />
            <Link to={ROUTE_PATHS.ADMIN_FINANCE_PLANS} className="btn btn-sm btn-soft-secondary">
              ← All plans
            </Link>
          </span>
        }
      />

      <Row className="justify-content-center">
        <Col xxl={12}>
          <Row>
            <Col xl={9}>
              <Card className="mb-3 shadow-sm">
                <CardBody className="pb-0 border-bottom border-light">
                  <Nav variant="underline" className="gap-3 flex-nowrap mb-0">
                    {PLAN_DETAIL_TAB_KEYS.map((key, i) => {
                      const { label, Icon } = PLAN_DETAIL_TAB_CONFIG[key]
                      return (
                        <Nav.Item key={key}>
                          <Nav.Link
                            active={tab === i}
                            href="#"
                            className="py-2 px-0"
                            onClick={(e) => {
                              e.preventDefault()
                              setTabKey(key)
                            }}
                          >
                            <TabNavLabel Icon={Icon}>{label}</TabNavLabel>
                          </Nav.Link>
                        </Nav.Item>
                      )
                    })}
                  </Nav>
                </CardBody>
                <CardBody className="pt-4 pb-4">
                  {(() => {
                    const tabKey = PLAN_DETAIL_TAB_KEYS[tab] ?? 'settings'
                    switch (tabKey) {
                      case 'settings':
                        return (
                          <FinancePlanDetailSettingsTab
                            productId={productId}
                            plan={plan}
                            form={form}
                            onFormChange={patchForm}
                            saving={updateMut.isPending}
                            createPricePending={createPriceMut.isPending}
                            setPriceActivePending={setPriceActiveMut.isPending}
                            onSave={() => void savePlan()}
                            onCreatePrice={async ({ amount, interval }) => {
                              try {
                                await createPriceMut.mutateAsync({
                                  productId,
                                  amount,
                                  interval,
                                  currency: plan.currency,
                                })
                                notifyOk('Price', 'New price created.')
                                void refetch()
                              } catch (e) {
                                notifyErr('Price', e instanceof Error ? e.message : 'Failed')
                              }
                            }}
                            onDeactivatePrice={async (priceId) => {
                              try {
                                await setPriceActiveMut.mutateAsync({
                                  priceId,
                                  active: false,
                                  productId,
                                })
                                notifyOk('Price', 'Price deactivated.')
                                void refetch()
                              } catch (e) {
                                notifyErr('Price', e instanceof Error ? e.message : 'Failed')
                              }
                            }}
                          />
                        )
                      case 'subscriptions':
                        return (
                          <FinancePlanDetailSubscriptionsTab
                            productId={productId}
                            fallbackSubscribers={subscribers}
                          />
                        )
                      case 'analytics':
                        return (
                          <FinancePlanDetailAnalyticsTab
                            productId={productId}
                            planName={plan.name}
                            stats={stats}
                            currency={plan.currency}
                          />
                        )
                      default: {
                        const _exhaustive: never = tabKey
                        return _exhaustive
                      }
                    }
                  })()}
                </CardBody>
              </Card>
            </Col>
            <Col xl={3}>
              <FinancePlanDetailSidebarCard
                plan={plan}
                stats={stats}
                hidden={hidden}
                hiddenSaving={updateMut.isPending}
                archiveBusy={setActiveMut.isPending}
                onHiddenChange={(v) => void onHiddenChange(v)}
                onArchive={() => void archiveProduct()}
                onUnarchive={() => void restoreProduct()}
              />
            </Col>
          </Row>
        </Col>
      </Row>
    </Container>
  )
}

export default FinancePlanDetailPage
