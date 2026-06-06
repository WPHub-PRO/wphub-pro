import { Badge, Card, Col, Row } from 'react-bootstrap';

import type { StripePlan } from '@/types';

function metadataMap(plan: StripePlan): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of plan.metadata ?? []) {
    out[row.key] = row.value;
  }
  return out;
}

function trackFromPlan(plan: StripePlan): 'solo' | 'team' | null {
  const m = metadataMap(plan);
  const t = String(m.wphub_track ?? m.WPHUB_TRACK ?? '')
    .trim()
    .toLowerCase();
  if (t === 'solo') return 'solo';
  if (t === 'team') return 'team';
  return null;
}

function tierLabel(plan: StripePlan): string {
  const m = metadataMap(plan);
  const tier = String(m.wphub_tier ?? m.WPHUB_TIER ?? '').trim();
  if (tier) return tier;
  return plan.name;
}

function formatMoney(amount: number, currency: string): string {
  const c = (currency || 'eur').toUpperCase();
  try {
    return amount.toLocaleString('nl-NL', { style: 'currency', currency: c });
  } catch {
    return `${amount} ${c}`;
  }
}

function PlanCard({ plan }: { plan: StripePlan }) {
  const hasMo = plan.monthlyPriceId != null && plan.monthlyPrice > 0;
  const hasYr = plan.yearlyPriceId != null && plan.yearlyPrice > 0;
  return (
    <Card className="h-100">
      <Card.Body>
        <Card.Title className="fs-6">{plan.name}</Card.Title>
        <div className="text-muted small mb-2">{tierLabel(plan)}</div>
        {hasMo || hasYr ? (
          <div className="fw-semibold">
            {hasMo ? (
              <div>
                {formatMoney(plan.monthlyPrice, plan.currency)} /mo
              </div>
            ) : null}
            {hasYr ? (
              <div className={hasMo ? 'text-muted small fw-normal mt-1' : ''}>
                {formatMoney(plan.yearlyPrice, plan.currency)} /yr
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-muted small">Price on request</div>
        )}
      </Card.Body>
    </Card>
  );
}

function PlanColumn({ title, subtitle, plans }: { title: string; subtitle: string; plans: StripePlan[] }) {
  return (
    <Col md={6}>
      <h6 className="mb-1">{title}</h6>
      <p className="text-muted small mb-3">{subtitle}</p>
      {plans.length === 0 ? (
        <p className="text-muted small mb-0">
          Geen producten met metadata <code>wphub_track={title === 'Solo' ? 'solo' : 'team'}</code> in Stripe.
        </p>
      ) : (
        <Row className="g-2">
          {plans.map((plan) => (
            <Col xs={12} key={plan.id}>
              <PlanCard plan={plan} />
            </Col>
          ))}
        </Row>
      )}
    </Col>
  );
}

/**
 * Read-only catalog: Solo (Free, Starter, …) vs Team rows based on Stripe product metadata
 * `wphub_track` = `solo` | `team` and optional `wphub_tier`.
 *
 * Expects the flattened `list-plans` / `stripe-products` shape from `@/types` (`StripePlan`), not SDK `{ product, price }`.
 */
export function SubscriptionManager({ plans }: { plans: StripePlan[] }) {
  const solo: StripePlan[] = [];
  const team: StripePlan[] = [];
  const other: StripePlan[] = [];
  for (const p of plans) {
    const t = trackFromPlan(p);
    if (t === 'solo') solo.push(p);
    else if (t === 'team') team.push(p);
    else other.push(p);
  }

  return (
    <Card className="mb-4">
      <Card.Body>
        <div className="d-flex align-items-center gap-2 mb-3">
          <Card.Title className="mb-0">Abonnementen</Card.Title>
          <Badge bg="secondary">catalogus</Badge>
        </div>
        <Row className="g-3">
          <PlanColumn
            title="Solo"
            subtitle="Persoonlijk — o.a. Free, Starter, Basic, Pro (Stripe metadata wphub_track=solo)."
            plans={solo}
          />
          <PlanColumn
            title="Team"
            subtitle="Team — Starter, Basic, Pro (Stripe metadata wphub_track=team)."
            plans={team}
          />
        </Row>
        {other.length > 0 ? (
          <div className="mt-3 pt-3 border-top">
            <h6 className="mb-2">Overige plannen</h6>
            <p className="text-muted small">
              Deze producten hebben nog geen <code>wphub_track</code> metadata; configureer ze in Stripe om ze onder
              Solo of Team te tonen.
            </p>
            <Row className="g-2">
              {other.map((plan) => (
                <Col xs={12} md={6} key={plan.id}>
                  <PlanCard plan={plan} />
                </Col>
              ))}
            </Row>
          </div>
        ) : null}
      </Card.Body>
    </Card>
  );
}
