import { useAuth } from '@/domains/auth';
import { useStripePlans } from '@/domains/billing/hooks';
import {
  isTeamTrackPlan,
  planSeatsIncluded,
  useCreateTeamCheckoutMutation,
} from '@/domains/teams';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import type { StripePlan } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';

function functionErrorMessage(err: unknown): string {
  if (err instanceof AppwriteFunctionError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

function formatMoneyMajor(plan: StripePlan, yearly: boolean): string {
  const n = yearly ? plan.yearlyPrice : plan.monthlyPrice;
  const cur = (plan.currency || 'eur').toUpperCase();
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n.toFixed(n < 10 && n % 1 !== 0 ? 2 : 0)} ${cur}`;
}

type TeamCreateModalProps = {
  show: boolean;
  onHide: () => void;
};

export default function TeamCreateModal({ show, onHide }: TeamCreateModalProps) {
  const { user } = useAuth();
  const plansQ = useStripePlans(undefined);
  const checkoutTeam = useCreateTeamCheckoutMutation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [yearly, setYearly] = useState(false);
  const [billingCompanyName, setBillingCompanyName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [billLine1, setBillLine1] = useState('');
  const [billLine2, setBillLine2] = useState('');
  const [billCity, setBillCity] = useState('');
  const [billState, setBillState] = useState('');
  const [billPostal, setBillPostal] = useState('');
  const [billCountry, setBillCountry] = useState('');

  const teamPlans = useMemo(() => (plansQ.data ?? []).filter(isTeamTrackPlan), [plansQ.data]);

  const selected = useMemo(
    () => teamPlans.find((p) => p.id === selectedId) ?? null,
    [teamPlans, selectedId],
  );

  const seatsIncluded = selected ? planSeatsIncluded(selected) : null;

  const priceIdForCheckout = useMemo(() => {
    if (!selected) return '';
    if (yearly) return selected.yearlyPriceId?.trim() ?? '';
    return selected.monthlyPriceId?.trim() ?? '';
  }, [selected, yearly]);

  const countryOk = /^[A-Za-z]{2}$/.test(billCountry.trim());
  const canSubmit =
    Boolean(user) &&
    Boolean(selected) &&
    teamName.trim().length > 0 &&
    billingCompanyName.trim().length > 0 &&
    billLine1.trim().length > 0 &&
    billCity.trim().length > 0 &&
    billPostal.trim().length > 0 &&
    countryOk &&
    Boolean(priceIdForCheckout) &&
    seatsIncluded != null;

  useEffect(() => {
    if (!show) {
      setSelectedId(null);
      setTeamName('');
      setYearly(false);
      setBillingCompanyName('');
      setVatNumber('');
      setBillLine1('');
      setBillLine2('');
      setBillCity('');
      setBillState('');
      setBillPostal('');
      setBillCountry('');
    }
  }, [show]);

  return (
    <Modal show={show} onHide={onHide} centered size="lg" scrollable backdrop={checkoutTeam.isPending ? 'static' : true}>
      <Modal.Header closeButton={!checkoutTeam.isPending}>
        <Modal.Title>Create team</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {plansQ.isLoading ? (
          <div className="d-flex justify-content-center py-4">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : null}

        {plansQ.error ? (
          <Alert variant="warning" className="mb-0">
            Could not load plans: {functionErrorMessage(plansQ.error)}
          </Alert>
        ) : null}

        {!plansQ.isLoading && !plansQ.error && teamPlans.length === 0 ? (
          <Alert variant="info" className="mb-0">
            No team sellable products found. In Stripe, set product metadata <code>wphub_track=team</code> (or put
            &quot;team&quot; in <code>type</code>) and <code>seats_included</code> on each team product.
          </Alert>
        ) : null}

        {teamPlans.length > 0 ? (
          <>
            <h6 className="text-muted text-uppercase small mb-2">Team plan</h6>
            <Row className="g-2 mb-3">
              {teamPlans.map((plan) => {
                const active = plan.id === selectedId;
                return (
                  <Col sm={6} key={plan.id}>
                    <Card
                      role="button"
                      tabIndex={0}
                      className={`h-100 shadow-sm ${active ? 'border-primary' : ''}`}
                      onClick={() => setSelectedId(plan.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId(plan.id);
                        }
                      }}
                    >
                      <Card.Body className="py-2">
                        <Form.Check
                          type="radio"
                          name="team-plan-modal"
                          id={`plan-modal-${plan.id}`}
                          checked={active}
                          onChange={() => setSelectedId(plan.id)}
                          label={<span className="fw-semibold">{plan.name}</span>}
                        />
                        <div className="small text-muted mt-1 ps-4">
                          {formatMoneyMajor(plan, false)} / mo · {formatMoneyMajor(plan, true)} / yr
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Billing cycle</Form.Label>
              <div>
                <Form.Check
                  inline
                  type="radio"
                  id="team-modal-bill-month"
                  name="team-modal-interval"
                  checked={!yearly}
                  onChange={() => setYearly(false)}
                  label="Monthly"
                  disabled={!selected?.monthlyPriceId}
                />
                <Form.Check
                  inline
                  type="radio"
                  id="team-modal-bill-year"
                  name="team-modal-interval"
                  checked={yearly}
                  onChange={() => setYearly(true)}
                  label="Yearly"
                  disabled={!selected?.yearlyPriceId}
                />
              </div>
              {selected && !priceIdForCheckout ? (
                <Form.Text className="text-danger">No price for this billing cycle.</Form.Text>
              ) : null}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Team workspace name</Form.Label>
              <Form.Control
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Acme Studio"
                maxLength={128}
                disabled={checkoutTeam.isPending}
              />
              <Form.Text className="text-muted">Shown in the app; can differ from your legal invoice name below.</Form.Text>
            </Form.Group>

            <h6 className="text-muted text-uppercase small mb-2 mt-4">Billing (saved to Stripe)</h6>
            <Form.Group className="mb-3">
              <Form.Label>Company / legal name (invoices)</Form.Label>
              <Form.Control
                value={billingCompanyName}
                onChange={(e) => setBillingCompanyName(e.target.value)}
                placeholder="Registered business or legal name"
                maxLength={256}
                disabled={checkoutTeam.isPending}
                autoComplete="organization"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>VAT or tax ID (optional)</Form.Label>
              <Form.Control
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="e.g. NL123456789B01"
                maxLength={64}
                disabled={checkoutTeam.isPending}
                autoComplete="off"
              />
              <Form.Text className="text-muted">
                Include your country prefix (NL, DE, GB, …). Leave empty if you do not have a VAT number.
              </Form.Text>
            </Form.Group>
            <Row className="g-2 mb-2">
              <Col xs={12}>
                <Form.Group>
                  <Form.Label>Street address</Form.Label>
                  <Form.Control
                    value={billLine1}
                    onChange={(e) => setBillLine1(e.target.value)}
                    placeholder="Line 1"
                    maxLength={500}
                    disabled={checkoutTeam.isPending}
                    autoComplete="street-address"
                  />
                </Form.Group>
              </Col>
              <Col xs={12}>
                <Form.Group>
                  <Form.Label className="text-muted small">Address line 2 (optional)</Form.Label>
                  <Form.Control
                    value={billLine2}
                    onChange={(e) => setBillLine2(e.target.value)}
                    placeholder="Apartment, suite, etc."
                    maxLength={500}
                    disabled={checkoutTeam.isPending}
                    autoComplete="address-line2"
                  />
                </Form.Group>
              </Col>
            </Row>
            <Row className="g-2 mb-3">
              <Col sm={6} md={4}>
                <Form.Group>
                  <Form.Label>City</Form.Label>
                  <Form.Control
                    value={billCity}
                    onChange={(e) => setBillCity(e.target.value)}
                    maxLength={100}
                    disabled={checkoutTeam.isPending}
                    autoComplete="address-level2"
                  />
                </Form.Group>
              </Col>
              <Col sm={6} md={4}>
                <Form.Group>
                  <Form.Label>State / province (optional)</Form.Label>
                  <Form.Control
                    value={billState}
                    onChange={(e) => setBillState(e.target.value)}
                    maxLength={100}
                    disabled={checkoutTeam.isPending}
                    autoComplete="address-level1"
                  />
                </Form.Group>
              </Col>
              <Col sm={6} md={4}>
                <Form.Group>
                  <Form.Label>Postal code</Form.Label>
                  <Form.Control
                    value={billPostal}
                    onChange={(e) => setBillPostal(e.target.value)}
                    maxLength={40}
                    disabled={checkoutTeam.isPending}
                    autoComplete="postal-code"
                  />
                </Form.Group>
              </Col>
              <Col sm={6} md={4}>
                <Form.Group>
                  <Form.Label>Country (ISO)</Form.Label>
                  <Form.Control
                    value={billCountry}
                    onChange={(e) => setBillCountry(e.target.value.toUpperCase())}
                    placeholder="NL"
                    maxLength={2}
                    disabled={checkoutTeam.isPending}
                    autoComplete="country"
                  />
                  <Form.Text className="text-muted">Two letters, e.g. NL, DE, GB.</Form.Text>
                </Form.Group>
              </Col>
            </Row>

            {selected ? (
              seatsIncluded != null ? (
                <p className="small text-muted mb-3">
                  Seats included: <strong>{seatsIncluded}</strong> (from Stripe product metadata{' '}
                  <code>seats_included</code>)
                </p>
              ) : (
                <Alert variant="warning" className="py-2 small mb-3">
                  This plan is missing Stripe metadata <code>seats_included</code>. Checkout cannot continue until it is
                  set on the product.
                </Alert>
              )
            ) : null}

            <p className="text-muted small mb-0">
              The next step is Stripe Checkout for your card or bank payment method. Your billing address and company
              details above are stored on the Stripe customer before checkout.
            </p>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide} disabled={checkoutTeam.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit || checkoutTeam.isPending}
          onClick={() => {
            if (!canSubmit || !priceIdForCheckout) return;
            checkoutTeam.mutate(
              {
                teamName: teamName.trim(),
                billingCompanyName: billingCompanyName.trim(),
                vatNumber: vatNumber.trim() || undefined,
                billingAddress: {
                  line1: billLine1.trim(),
                  line2: billLine2.trim() || undefined,
                  city: billCity.trim(),
                  state: billState.trim() || undefined,
                  postal_code: billPostal.trim(),
                  country: billCountry.trim().toUpperCase(),
                },
                interval: yearly ? 'year' : 'month',
                priceId: priceIdForCheckout,
              },
              {
                onSuccess: (res) => {
                  if (res?.url) window.location.href = res.url;
                },
              },
            );
          }}
        >
          {checkoutTeam.isPending ? 'Redirecting…' : 'Continue to checkout'}
        </Button>
      </Modal.Footer>
      {checkoutTeam.error ? (
        <div className="px-3 pb-3">
          <p className="text-danger small mb-0">{functionErrorMessage(checkoutTeam.error)}</p>
        </div>
      ) : null}
    </Modal>
  );
}
