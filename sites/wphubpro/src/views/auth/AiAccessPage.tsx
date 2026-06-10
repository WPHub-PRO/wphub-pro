import Loader from '@/components/Loader';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import { redeemAiAccessLinkGuest } from '@/domains/platform/aiAccessApi';
import {
  account,
  clearImpersonationClientAndStorage,
} from '@/services/appwrite';
import { clearPagespeedSessionStorage } from '@/domains/sites/pagespeedSessionCache';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Col, Container, Row } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router';

type RedeemState = 'pending' | 'success' | 'error';

export default function AiAccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const token = useMemo(() => (params.get('token') || '').trim(), [params]);
  const startedRef = useRef(false);

  const [state, setState] = useState<RedeemState>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

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
        if (!res?.success || !res.userId || !res.secret) {
          throw new Error(res?.message || 'Could not redeem access link.');
        }

        await account.createSession(res.userId, res.secret);
        await refreshUser();
        if (cancelled) return;

        setState('success');
        navigate(ROUTE_PATHS.DASHBOARD, { replace: true });
      } catch (e) {
        if (cancelled) return;
        setState('error');
        setErrorMessage(e instanceof Error ? e.message : 'Could not sign in with this link.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate, refreshUser]);

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
