import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useAuth } from '@/domains/auth';
import { useAdminCustomerSubscriptions, useAdminTeamDetail, useAdminTeamPatchMaxSeats } from '@/domains/admin/useAdminTeams';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router';

function stripeSubPrimaryPlanLabel(sub: Record<string, unknown>): string {
  const items = sub.items as { data?: unknown[] } | undefined;
  const first = items?.data?.[0] as Record<string, unknown> | undefined;
  const price = first?.price as Record<string, unknown> | undefined;
  const product = price?.product as Record<string, unknown> | string | undefined;
  if (product && typeof product === 'object' && typeof product.name === 'string' && product.name.trim()) {
    return product.name.trim();
  }
  const nick = price?.nickname;
  if (typeof nick === 'string' && nick.trim()) return nick.trim();
  return '—';
}

function sortStripeSubsForDisplay(subs: Record<string, unknown>[]): Record<string, unknown>[] {
  const rank = (s: string) => {
    if (s === 'active') return 0;
    if (s === 'trialing') return 1;
    return 2;
  };
  return [...subs].sort((a, b) => {
    const sa = String(a.status ?? '');
    const sb = String(b.status ?? '');
    const dr = rank(sa) - rank(sb);
    if (dr !== 0) return dr;
    return Number(b.created ?? 0) - Number(a.created ?? 0);
  });
}

export default function AdminTeamDetailPage() {
  const { teamId: teamIdParam } = useParams();
  const teamId = teamIdParam?.trim() ?? '';
  const { isAdmin } = useAuth();
  const { mode } = useDashboardNav();
  const navigate = useNavigate();
  const detailQ = useAdminTeamDetail(teamId);
  const patch = useAdminTeamPatchMaxSeats();
  const [maxInput, setMaxInput] = useState('');

  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
      return;
    }
    if (mode !== 'admin') {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
    }
  }, [isAdmin, mode, navigate]);

  const row = detailQ.data?.row;
  const stripeCustomerForSubs =
    row?.stripeCustomerId?.trim().startsWith('cus_') ? row.stripeCustomerId.trim() : undefined;
  const subsQ = useAdminCustomerSubscriptions(stripeCustomerForSubs);
  const sortedSubs = useMemo(() => sortStripeSubsForDisplay(subsQ.data ?? []), [subsQ.data]);

  useEffect(() => {
    if (row?.maxSeats != null && Number.isFinite(Number(row.maxSeats))) {
      setMaxInput(String(row.maxSeats));
    }
  }, [row?.maxSeats]);

  if (!isAdmin || mode !== 'admin') {
    return null;
  }

  const stripeDash = (cid: string) =>
    cid.startsWith('cus_') ? `https://dashboard.stripe.com/customers/${encodeURIComponent(cid)}` : '';

  return (
    <>
      <PageMetaData title={`Admin — Team ${teamId}`} />
      <PageBreadcrumb
        title="Team detail"
        subtitle={detailQ.data?.teamName || teamId}
        titleEnd={
          <Link className="btn btn-outline-secondary btn-sm" to={ROUTE_PATHS.ADMIN_TEAMS}>
            Back to list
          </Link>
        }
      />
      <Container fluid>
        {detailQ.isLoading && (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" role="status" variant="primary" />
          </div>
        )}
        {detailQ.isError && (
          <Alert variant="danger">{detailQ.error instanceof Error ? detailQ.error.message : 'Load failed.'}</Alert>
        )}
        {!detailQ.isLoading && !detailQ.isError && detailQ.data && (
          <Row className="g-3">
            <Col lg={6}>
              <Card className="shadow-sm">
                <Card.Body>
                  <h5 className="mb-3">Team</h5>
                  <p className="mb-1">
                    <span className="text-muted">Name:</span> {detailQ.data.teamName || '—'}
                  </p>
                  <p className="mb-1">
                    <span className="text-muted">Members:</span> {detailQ.data.memberCount}
                  </p>
                  <p className="mb-0 font-monospace small text-muted">ID: {detailQ.data.teamId}</p>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={6}>
              <Card className="shadow-sm">
                <Card.Body>
                  <h5 className="mb-3">Billing metadata</h5>
                  {!row ? (
                    <p className="text-muted mb-0">No platform row for this team id (legacy team).</p>
                  ) : (
                    <>
                      <p className="mb-1">
                        <span className="text-muted">Owner user id:</span>{' '}
                        <span className="font-monospace small">{row.ownerId || '—'}</span>
                      </p>
                      <p className="mb-1">
                        <span className="text-muted">Stripe subscription:</span>{' '}
                        <span className="font-monospace small">{row.stripeSubscriptionId || '—'}</span>
                      </p>
                      <p className="mb-2">
                        <span className="text-muted">Stripe customer:</span>{' '}
                        <span className="font-monospace small">{row.stripeCustomerId || '—'}</span>
                        {stripeDash(row.stripeCustomerId) ? (
                          <>
                            {' '}
                            <a href={stripeDash(row.stripeCustomerId)} target="_blank" rel="noreferrer">
                              Open in Stripe
                            </a>
                          </>
                        ) : null}
                      </p>
                      <Form
                        className="d-flex flex-wrap align-items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const n = Math.max(1, Math.min(999, Number(maxInput) || 0));
                          if (!n || !teamId) return;
                          patch.mutate({ teamId, maxSeats: n });
                        }}
                      >
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Max seats</Form.Label>
                          <Form.Control
                            type="number"
                            min={1}
                            max={999}
                            value={maxInput}
                            onChange={(e) => setMaxInput(e.target.value)}
                            disabled={patch.isPending}
                            style={{ maxWidth: '140px' }}
                          />
                        </Form.Group>
                        <Button type="submit" variant="primary" size="sm" disabled={patch.isPending}>
                          {patch.isPending ? 'Saving…' : 'Save'}
                        </Button>
                      </Form>
                      {patch.isError && (
                        <p className="text-danger small mb-0 mt-2">
                          {patch.error instanceof Error ? patch.error.message : 'Save failed.'}
                        </p>
                      )}
                    </>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}
        {!detailQ.isLoading && !detailQ.isError && detailQ.data && stripeCustomerForSubs ? (
          <Row className="g-3 mt-1">
            <Col xs={12}>
              <Card className="shadow-sm">
                <Card.Body>
                  <h5 className="mb-3">Stripe subscriptions (from customer)</h5>
                  <p className="text-muted small mb-3">
                    Loaded from Stripe using this team&apos;s customer id. Use when the stored subscription id is missing or
                    stale.
                  </p>
                  {!row?.stripeSubscriptionId?.trim() && sortedSubs.length > 0 ? (
                    <Alert variant="warning" className="py-2 small mb-3">
                      The platform has no stored subscription id, but Stripe lists {sortedSubs.length} subscription(s) for
                      this customer.
                    </Alert>
                  ) : null}
                  {subsQ.isLoading && (
                    <div className="d-flex align-items-center gap-2 text-muted small">
                      <Spinner animation="border" size="sm" role="status" />
                      Loading subscriptions…
                    </div>
                  )}
                  {subsQ.isError && (
                    <p className="text-danger small mb-0">
                      {subsQ.error instanceof Error ? subsQ.error.message : 'Failed to load Stripe subscriptions.'}
                    </p>
                  )}
                  {!subsQ.isLoading && !subsQ.isError && sortedSubs.length === 0 ? (
                    <p className="text-muted small mb-0">No subscriptions on this Stripe customer.</p>
                  ) : null}
                  {!subsQ.isLoading && !subsQ.isError && sortedSubs.length > 0 ? (
                    <div className="table-responsive border rounded">
                      <table className="table table-hover table-sm table-custom table-centered table-nowrap mb-0 align-middle">
                        <thead className="bg-light align-middle bg-opacity-25 thead-sm">
                          <tr className="text-uppercase fs-xxs">
                            <th scope="col">Subscription</th>
                            <th scope="col">Status</th>
                            <th scope="col">Plan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedSubs.map((s) => {
                            const sid = String(s.id ?? '');
                            return (
                              <tr key={sid || JSON.stringify(s.created)}>
                                <td className="font-monospace small">
                                  {sid ? (
                                    <Link to={ROUTE_PATHS.adminFinanceSubscriptionPath(sid)}>{sid}</Link>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="small">{String(s.status ?? '—')}</td>
                                <td className="small">{stripeSubPrimaryPlanLabel(s)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        ) : null}
      </Container>
    </>
  );
}
