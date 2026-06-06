import AppLogo from '@/components/AppLogo';
import Loader from '@/components/Loader';
import { ROUTE_PATHS } from '@/config/routePaths';
import { POST_AUTH_REDIRECT_QUERY_KEY } from '@/domains/auth/postAuthRedirect';
import { useAuth } from '@/domains/auth';
import { attachFreeTierIfConfigured, teamInviteClaimAuthed, teamInviteDeclineGuest, teamInvitePreviewGuest } from '@/domains/teams';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Container, Row } from 'react-bootstrap';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';

function errMsg(e: unknown): string {
  if (e instanceof AppwriteFunctionError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export default function InviteTeamPage() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteId = useMemo(() => (params.get('i') || '').trim(), [params]);
  const token = useMemo(() => (params.get('t') || '').trim(), [params]);
  const declineOneShot = useMemo(() => params.get('d') === '1', [params]);

  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [teamId, setTeamId] = useState('');

  const [declining, setDeclining] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [declineErr, setDeclineErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!inviteId || !token) {
      setPreviewError('This link is missing invitation details.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setPreviewError(null);
    try {
      const res = await teamInvitePreviewGuest({ inviteId, token });
      if (!res.success) {
        setPreviewError(res.message || 'This invitation is not valid.');
        setLoading(false);
        return;
      }
      setTeamName(res.teamName || 'Team');
      setEmail(res.email || '');
      setTeamId(res.teamId || '');
    } catch (e) {
      setPreviewError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [inviteId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!declineOneShot || !inviteId || !token || loading || previewError) return;
    let cancelled = false;
    (async () => {
      setDeclining(true);
      setDeclineErr(null);
      try {
        await teamInviteDeclineGuest({ inviteId, token });
        if (!cancelled) setDeclined(true);
      } catch (e) {
        if (!cancelled) setDeclineErr(errMsg(e));
      } finally {
        if (!cancelled) setDeclining(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [declineOneShot, inviteId, token, loading, previewError]);

  const acceptHref = `${ROUTE_PATHS.REGISTER_INVITE}?i=${encodeURIComponent(inviteId)}&t=${encodeURIComponent(token)}`;

  const loginWithReturnHref = useMemo(() => {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return `${ROUTE_PATHS.LOGIN}?${POST_AUTH_REDIRECT_QUERY_KEY}=${next}`;
  }, [location.pathname, location.search]);

  const sessionEmail = (user?.email || '').trim().toLowerCase();
  const invitedLower = email.trim().toLowerCase();
  const canJoinAsSession = Boolean(user && invitedLower && sessionEmail === invitedLower);

  const [joining, setJoining] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  const runDecline = async () => {
    if (!inviteId || !token) return;
    setDeclining(true);
    setDeclineErr(null);
    try {
      await teamInviteDeclineGuest({ inviteId, token });
      setDeclined(true);
    } catch (e) {
      setDeclineErr(errMsg(e));
    } finally {
      setDeclining(false);
    }
  };

  const runJoin = async () => {
    if (!user || !inviteId || !token) return;
    setJoining(true);
    setJoinErr(null);
    try {
      const claimed = await teamInviteClaimAuthed({ inviteId, token });
      if (!claimed.success) {
        throw new Error(claimed.message || 'Could not join the team.');
      }
      await attachFreeTierIfConfigured(user.$id);
      const tid = String(claimed.teamId || teamId || '').trim();
      if (tid) navigate(ROUTE_PATHS.teamPath(tid), { replace: true });
      else navigate(ROUTE_PATHS.TEAMS, { replace: true });
    } catch (e) {
      setJoinErr(errMsg(e));
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <Loader height="100vh" />;
  }

  if (previewError) {
    return (
      <div className="auth-box overflow-hidden align-items-center d-flex" style={{ minHeight: '100vh' }}>
        <Container>
          <Row className="justify-content-center">
            <Col xxl={5} md={7} sm={10}>
              <Card className="p-4 shadow-sm border-0">
                <div className="text-center mb-3">
                  <AppLogo />
                </div>
                <Alert variant="warning">{previewError}</Alert>
                <Link className="btn btn-primary w-100" to={ROUTE_PATHS.LOGIN}>
                  Sign in
                </Link>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="auth-box overflow-hidden align-items-center d-flex" style={{ minHeight: '100vh' }}>
        <Container>
          <Row className="justify-content-center">
            <Col xxl={5} md={7} sm={10}>
              <Card className="p-4 shadow-sm border-0 text-center">
                <AppLogo />
                <p className="mt-3 mb-0">You have declined the invitation. You can close this window.</p>
                <Link className="btn btn-outline-primary mt-4" to={ROUTE_PATHS.LOGIN}>
                  Home
                </Link>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  return (
    <div className="auth-box overflow-hidden align-items-center d-flex" style={{ minHeight: '100vh' }}>
      <Container>
        <Row className="justify-content-center">
          <Col xxl={5} md={7} sm={10}>
            <Card className="p-4 shadow-sm border-0">
              <div className="text-center mb-3">
                <AppLogo />
                <p className="text-muted mt-2 mb-0">Team invitation</p>
              </div>
              <p className="mb-1">
                You are invited to join <strong>{teamName}</strong>
                {teamId ? (
                  <span className="text-muted small">
                    {' '}
                    (team <code className="small">{teamId}</code>)
                  </span>
                ) : null}
              </p>
              {email ? (
                <p className="text-muted small mb-4">
                  Invited address: <strong>{email}</strong>
                </p>
              ) : (
                <div className="mb-4" />
              )}
              {declineErr ? (
                <Alert variant="danger" className="py-2">
                  {declineErr}
                </Alert>
              ) : null}
              {joinErr ? (
                <Alert variant="danger" className="py-2">
                  {joinErr}
                </Alert>
              ) : null}
              {user && !canJoinAsSession ? (
                <Alert variant="warning" className="py-2 small">
                  You are signed in as <strong>{user.email}</strong>. Sign out to accept with <strong>{email}</strong>, or
                  use a private window.
                  <div className="mt-2">
                    <Button type="button" size="sm" variant="outline-dark" onClick={() => void logout()}>
                      Sign out
                    </Button>
                  </div>
                </Alert>
              ) : null}
              <div className="d-grid gap-2">
                {canJoinAsSession ? (
                  <Button type="button" variant="primary" size="lg" disabled={joining} onClick={() => void runJoin()}>
                    {joining ? 'Joining…' : 'Accept — join team'}
                  </Button>
                ) : (
                  <Link className="btn btn-primary btn-lg" to={acceptHref}>
                    Accept — create account
                  </Link>
                )}
                <Button type="button" variant="outline-secondary" disabled={declining} onClick={() => void runDecline()}>
                  {declining ? 'Declining…' : 'Decline invitation'}
                </Button>
              </div>
              {!user ? (
                <p className="text-muted small mt-4 mb-0 text-center">
                  Already have an account?{' '}
                  <Link to={loginWithReturnHref}>
                    Sign in
                  </Link>{' '}
                  with <strong>{email}</strong>, then return here and tap <em>Accept — join team</em>.
                </p>
              ) : null}
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
