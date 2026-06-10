import Loader from '@/components/Loader';
import { ROUTE_PATHS } from '@/config/routePaths';
import { redeemAiAccessLinkGuest } from '@/domains/platform/aiAccessApi';
import { clearPagespeedSessionStorage } from '@/domains/sites/pagespeedSessionCache';
import { account, clearImpersonationClientAndStorage } from '@/services/appwrite';
import { AppwriteException } from 'appwrite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Container, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router';

type RedeemState = 'pending' | 'error';

function isMfaFactorsRequiredError(err: unknown): boolean {
  if (err instanceof AppwriteException) {
    return err.type === 'user_more_factors_required';
  }
  const o = err as { type?: string };
  return o.type === 'user_more_factors_required';
}

async function createSessionFromSecret(userId: string, secret: string): Promise<void> {
  const uid = userId.trim();
  const code = secret.trim();
  if (!uid || !code) {
    throw new Error('Invalid session credentials from access link.');
  }

  // Appwrite SDK v24 accepts object params; keep positional fallback for older builds.
  try {
    await account.createSession({ userId: uid, secret: code });
  } catch (first) {
    try {
      await account.createSession(uid, code);
    } catch {
      throw first;
    }
  }
}

export default function AiAccessPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);

  const [state, setState] = useState<RedeemState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('This link is missing an access token.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        clearPagespeedSessionStorage();
        clearImpersonationClientAndStorage();
        try {
          await account.deleteSession('current');
        } catch {
          /* no session */
        }

        const res = await redeemAiAccessLinkGuest(token);
        if (cancelled) return;

        if (!res?.success || !res.userId || !res.secret) {
          throw new Error(res?.message || 'Could not redeem access link.');
        }

        await createSessionFromSecret(res.userId, res.secret);
        if (cancelled) return;

        // Full reload so AuthProvider hydrates the new cookie session (avoids stale React auth state).
        window.location.replace(ROUTE_PATHS.DASHBOARD);
      } catch (e) {
        if (cancelled) return;
        if (isMfaFactorsRequiredError(e)) {
          setErrorMessage(
            'This account requires MFA. Passwordless access links cannot complete MFA automatically — sign in normally or disable forced MFA for this workflow.',
          );
        } else {
          setErrorMessage(e instanceof Error ? e.message : 'Could not sign in with this link.');
        }
        setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card className="border shadow-sm">
            <Card.Body className="p-4 text-center">
              {state === 'pending' ? (
                <>
                  <Loader height="120px" width="100%" />
                  <p className="text-muted mb-0 mt-3">Signing you in…</p>
                </>
              ) : null}

              {state === 'error' ? (
                <>
                  <Alert variant="danger" className="text-start mb-3">
                    {errorMessage || 'This access link is not valid.'}
                  </Alert>
                  <Link to={ROUTE_PATHS.LOGIN} className="btn btn-primary">
                    Go to sign in
                  </Link>
                </>
              ) : null}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
