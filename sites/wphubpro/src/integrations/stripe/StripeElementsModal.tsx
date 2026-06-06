import { type FormEvent, useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';
import {
  useCreateSetupIntent,
  useSetDefaultPaymentMethod,
  type BillingAccountContext,
} from '@/domains/billing';
import { getStripe, getStripePublishableKey } from '@/lib/stripe-loader';

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? getStripe() : null;

type AddCardFormProps = {
  onClose: () => void;
  onSuccess?: () => void;
  billingContext?: BillingAccountContext;
};

function AddCardForm({ onClose, onSuccess, billingContext }: AddCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const setDefault = useSetDefaultPaymentMethod(billingContext);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!stripe || !elements) return;
    setLoading(true);
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      });
      if (error) {
        setLocalError(error.message ?? 'Payment failed');
        return;
      }
      if (setupIntent?.payment_method) {
        const pmId =
          typeof setupIntent.payment_method === 'string'
            ? setupIntent.payment_method
            : (setupIntent.payment_method as { id?: string })?.id;
        if (pmId) await setDefault.mutateAsync(pmId);
      }
      onSuccess?.();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {localError ? (
        <Alert variant="danger" className="mb-3 py-2">
          {localError}
        </Alert>
      ) : null}
      <div className="mb-3" style={{ minHeight: 120 }}>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>
      <div className="d-flex justify-content-end gap-2">
        <Button type="button" variant="light" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!stripe || loading}>
          {loading ? 'Saving…' : 'Add card'}
        </Button>
      </div>
    </form>
  );
}

export type StripeElementsModalProps = {
  show: boolean;
  onHide: () => void;
  onSuccess?: () => void;
  /** When set, SetupIntent and default PM use this Stripe customer (personal or team owner). */
  billingContext?: BillingAccountContext;
};

/**
 * Bootstrap modal: create Setup Intent via Appwrite, then Stripe Payment Element to add a card.
 */
export function StripeElementsModal({ show, onHide, onSuccess, billingContext }: StripeElementsModalProps) {
  const createSetupIntent = useCreateSetupIntent(billingContext);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    if (!show) {
      setClientSecret(null);
      return;
    }
    if (!publishableKey || !stripePromise) return;
    setClientSecret(null);
    createSetupIntent.reset();
    createSetupIntent.mutate(undefined, {
      onSuccess: (data) => {
        if (data?.clientSecret) setClientSecret(data.clientSecret);
      },
    });
  }, [
    show,
    billingContext?.stripeCustomerId,
    billingContext?.entityType,
    billingContext?.teamId,
    // createSetupIntent from useMutation is stable enough; omit to avoid dependency churn
  ]);

  const handleHide = () => {
    setClientSecret(null);
    onHide();
  };

  const missingKey = !publishableKey;

  return (
    <Modal show={show} onHide={handleHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Add payment method</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {missingKey ? (
          <Alert variant="warning" className="mb-0">
            Missing <code>STRIPE_PUBLISHABLE_KEY</code>. Card capture is disabled until it is set in the
            environment.
          </Alert>
        ) : null}
        {!missingKey && createSetupIntent.isPending && !clientSecret ? (
          <div className="d-flex align-items-center gap-2 py-3">
            <Spinner animation="border" size="sm" />
            <span className="text-muted fs-sm">Preparing secure form…</span>
          </div>
        ) : null}
        {!missingKey && createSetupIntent.isError ? (
          <Alert variant="danger" className="mb-0">
            {createSetupIntent.error?.message ?? 'Could not start add card.'}
          </Alert>
        ) : null}
        {!missingKey && clientSecret && stripePromise ? (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
            <AddCardForm
              billingContext={billingContext}
              onClose={handleHide}
              onSuccess={() => {
                onSuccess?.();
              }}
            />
          </Elements>
        ) : null}
      </Modal.Body>
    </Modal>
  );
}
