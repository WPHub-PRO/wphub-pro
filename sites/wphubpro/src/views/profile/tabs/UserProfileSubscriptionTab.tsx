import { SubscriptionBillingPanel } from '@/components/billing/SubscriptionBillingPanel';
import { ROUTE_PATHS } from '@/config/routePaths';
import type { BillingAccountContext } from '@/domains/billing';
import { useAuth } from '@/domains/auth';
import { useMyAccountDoc } from '@/domains/profile/useMyAccountDoc';
import { useMemo } from 'react';
import { Alert, Spinner } from 'react-bootstrap';

/**
 * Personal Stripe subscription & billing only. Team workspace billing lives on the team detail page.
 */
const UserProfileSubscriptionTab = () => {
  const { user } = useAuth();
  const { data: accountDoc, isLoading, isError, error } = useMyAccountDoc(user?.$id);

  const accountSettled = !isLoading;
  const stripeCustomerId =
    !isError && accountDoc?.stripe_customer_id ? String(accountDoc.stripe_customer_id).trim() : '';

  const billingCtx: BillingAccountContext = useMemo(
    () => ({
      accountReady: accountSettled,
      stripeCustomerId,
      entityType: 'user',
    }),
    [accountSettled, stripeCustomerId],
  );

  const checkoutReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return `${ROUTE_PATHS.PROFILE}?tab=subscription`;
    return `${window.location.origin}${ROUTE_PATHS.PROFILE}?tab=subscription`;
  }, []);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-4">
        <Spinner animation="border" size="sm" role="status" variant="primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="warning" className="mb-0">
        {error instanceof Error
          ? error.message
          : 'Could not load subscription data. You may not have access to the accounts collection.'}
      </Alert>
    );
  }

  return (
    <SubscriptionBillingPanel
      activeBillingCtx={billingCtx}
      accountDoc={accountDoc}
      personalStripeCustomerId={stripeCustomerId}
      checkoutReturnUrl={checkoutReturnUrl}
    />
  );
};

export default UserProfileSubscriptionTab;
