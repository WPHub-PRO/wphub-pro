import { SubscriptionBillingPanel } from '@/components/billing/SubscriptionBillingPanel';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { ROUTE_PATHS } from '@/config/routePaths';
import type { BillingAccountContext } from '@/domains/billing/hooks';
import { useAuth } from '@/domains/auth';
import { useMyAccountDoc } from '@/domains/profile/useMyAccountDoc';
import { useTeamWorkspaceWithActiveSync } from '@/domains/workspace';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import { useMemo } from 'react';
import { Alert, Col, Container, Row, Spinner } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

function functionErrorMessage(err: unknown): string {
  if (err instanceof AppwriteFunctionError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export default function TeamBillingPage() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const teamId = teamIdParam?.trim() ?? '';
  const { user } = useAuth();
  const teamQ = useTeamWorkspaceWithActiveSync(teamId || null);
  const { data: accountDoc } = useMyAccountDoc(user?.$id);
  const personalStripeCustomerId =
    accountDoc?.stripe_customer_id ? String(accountDoc.stripe_customer_id).trim() : '';

  const data = teamQ.data;
  const isMemberOnly = data?.accountKind === 'team_member';
  const isOwner = Boolean(data?.isOwner);
  const canManageBilling = Boolean(data?.team && isOwner && !isMemberOnly);

  const teamBillingCtx = useMemo((): BillingAccountContext | undefined => {
    if (!data?.team?.$id || !data.stripeCustomerIdTeam) return undefined;
    return {
      accountReady: true,
      stripeCustomerId: data.stripeCustomerIdTeam,
      entityType: 'team',
      teamId: data.team.$id,
    };
  }, [data?.stripeCustomerIdTeam, data?.team?.$id]);

  const checkoutReturnUrl = useMemo(() => {
    if (!teamId) return '';
    if (typeof window === 'undefined') return ROUTE_PATHS.teamBillingPath(teamId);
    return `${window.location.origin}${ROUTE_PATHS.teamBillingPath(teamId)}`;
  }, [teamId]);

  if (!user) return null;

  if (!teamId) {
    return (
      <Container fluid>
        <Alert variant="danger">Missing team id.</Alert>
      </Container>
    );
  }

  return (
    <>
      <PageMetaData title={data?.team?.name ? `${data.team.name} · Billing` : 'Team billing'} />
      <PageBreadcrumb
        title={data?.team?.name ? `${data.team.name} · Billing` : 'Team billing'}
        subtitle="Subscription, payment methods, and invoices"
        titleEnd={
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <Link to={ROUTE_PATHS.teamPath(teamId)} className="btn btn-outline-secondary btn-sm">
              Your team
            </Link>
            <Link to={ROUTE_PATHS.TEAMS} className="btn btn-outline-secondary btn-sm">
              All teams
            </Link>
          </div>
        }
      />
      <Container fluid>
        {teamQ.isLoading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" role="status" variant="primary" />
          </div>
        ) : null}

        {teamQ.error ? (
          <Alert variant="warning" className="shadow-sm">
            <strong>Could not load team.</strong>{' '}
            <span className="text-body">{functionErrorMessage(teamQ.error)}</span>
          </Alert>
        ) : null}

        {!teamQ.isLoading && !teamQ.error && data && !data.team ? (
          <Alert variant="secondary">You do not have access to this team or it does not exist.</Alert>
        ) : null}

        {!teamQ.isLoading && !teamQ.error && data?.team && !canManageBilling ? (
          <Alert variant="secondary" className="shadow-sm">
            Only the team owner can manage billing for this workspace.{' '}
            <Link to={ROUTE_PATHS.teamPath(teamId)}>Back to your team</Link>
          </Alert>
        ) : null}

        {!teamQ.isLoading && !teamQ.error && data?.team && canManageBilling && !teamBillingCtx ? (
          <Row className="justify-content-center">
            <Col xxl={10}>
              <Alert variant="light" className="border shadow-sm">
                <p className="fs-sm mb-2">
                  Team billing is not linked to Stripe yet. Start team checkout from the teams hub to subscribe and
                  allocate seats.
                </p>
                <Link to={ROUTE_PATHS.TEAMS} className="btn btn-primary btn-sm">
                  Go to teams hub
                </Link>
              </Alert>
            </Col>
          </Row>
        ) : null}

        {!teamQ.isLoading && !teamQ.error && data?.team && canManageBilling && teamBillingCtx ? (
          <Row className="justify-content-center">
            <Col xxl={10}>
              <p className="text-muted small mb-3">
                Team: <strong>{data.team.name}</strong> ·{' '}
                <span className="font-monospace">{data.team.$id}</span>
              </p>
              <SubscriptionBillingPanel
                activeBillingCtx={teamBillingCtx}
                accountDoc={accountDoc}
                personalStripeCustomerId={personalStripeCustomerId}
                checkoutReturnUrl={checkoutReturnUrl}
                teamStripeCustomerIdDebug={data.stripeCustomerIdTeam ?? null}
              />
            </Col>
          </Row>
        ) : null}
      </Container>
    </>
  );
}
