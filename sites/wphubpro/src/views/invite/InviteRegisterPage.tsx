import AppLogo from '@/components/AppLogo';
import Loader from '@/components/Loader';
import PasswordInputWithStrength from '@/components/PasswordInputWithStrength';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import {
  attachFreeTierIfConfigured,
  teamInviteClaimAuthed,
  teamInvitePreviewGuest,
  useTeamInviteClaimMutation,
} from '@/domains/teams';
import { currentYear } from '@/helpers';
import { AppwriteFunctionError } from '@/integrations/appwrite/errors';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Card, Col, Container, Form, FormControl, FormLabel, Row, Spinner } from 'react-bootstrap';

function errMsg(e: unknown): string {
  if (e instanceof AppwriteFunctionError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export default function InviteRegisterPage() {
  const [params] = useSearchParams();
  const inviteId = useMemo(() => (params.get('i') || '').trim(), [params]);
  const token = useMemo(() => (params.get('t') || '').trim(), [params]);

  const { user, register, refreshUser, logout, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const claimMut = useTeamInviteClaimMutation();

  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [agreement, setAgreement] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sessionClaimError, setSessionClaimError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimingSession, setClaimingSession] = useState(false);

  const claimAttempted = useRef(false);

  const loadPreview = useCallback(async () => {
    if (!inviteId || !token) {
      setPreviewError('Invalid invite link.');
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await teamInvitePreviewGuest({ inviteId, token });
      if (!res.success || !res.email) {
        setPreviewError(res.message || 'This invitation is not valid.');
        return;
      }
      setInvitedEmail(res.email);
      setTeamName(res.teamName || 'Team');
      setTeamId(res.teamId || '');
    } catch (e) {
      setPreviewError(errMsg(e));
    } finally {
      setPreviewLoading(false);
    }
  }, [inviteId, token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const finishInviteForSessionUser = useCallback(
    async (sessionUser: { $id: string; email?: string }) => {
      const pv = await teamInvitePreviewGuest({ inviteId, token });
      const want = (pv.email || '').trim().toLowerCase();
      const got = (sessionUser.email || '').trim().toLowerCase();
      if (!want || want !== got) {
        throw new Error('Sign in with the invited email address, or sign out and use this link again.');
      }
      const claimed = await teamInviteClaimAuthed({ inviteId, token });
      if (!claimed.success) {
        throw new Error(claimed.message || 'Could not accept invitation.');
      }
      await attachFreeTierIfConfigured(sessionUser.$id);
      await refreshUser();
      const tid = String(claimed.teamId || teamId || '').trim();
      if (tid) navigate(ROUTE_PATHS.teamPath(tid), { replace: true });
      else navigate(ROUTE_PATHS.TEAMS, { replace: true });
    },
    [inviteId, token, navigate, refreshUser, teamId],
  );

  useEffect(() => {
    if (authLoading || previewLoading || previewError || !inviteId || !token) return;
    if (!user) return;
    if (claimAttempted.current) return;
    claimAttempted.current = true;
    setClaimingSession(true);
    setSessionClaimError(null);
    void (async () => {
      try {
        await finishInviteForSessionUser(user);
      } catch (e) {
        claimAttempted.current = false;
        setSessionClaimError(errMsg(e));
      } finally {
        setClaimingSession(false);
      }
    })();
  }, [authLoading, previewLoading, previewError, inviteId, token, user, finishInviteForSessionUser]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    if (!agreement) {
      setFormError('Please agree to the terms to continue.');
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      await register(name, invitedEmail, password);
      const claimed = await claimMut.mutateAsync({ inviteId, token });
      if (!claimed.success) {
        throw new Error(claimed.message || 'Could not join the team.');
      }
      await attachFreeTierIfConfigured();
      const tid = String(claimed.teamId || teamId || '').trim();
      if (tid) navigate(ROUTE_PATHS.teamPath(tid), { replace: true });
      else navigate(ROUTE_PATHS.TEAMS, { replace: true });
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || previewLoading || claimingSession) {
    return <Loader height="100vh" />;
  }

  if (previewError || !inviteId || !token) {
    return (
      <div className="auth-box overflow-hidden align-items-center d-flex" style={{ minHeight: '100vh' }}>
        <Container>
          <Row className="justify-content-center">
            <Col xxl={4} md={6} sm={8}>
              <Card className="p-4">
                <div className="text-center mb-3">
                  <AppLogo />
                </div>
                <Alert variant="danger">{previewError || 'Invalid invite link.'}</Alert>
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

  if (user && sessionClaimError) {
    return (
      <div className="auth-box overflow-hidden align-items-center d-flex" style={{ minHeight: '100vh' }}>
        <Container>
          <Row className="justify-content-center">
            <Col xxl={4} md={6} sm={8}>
              <Card className="p-4">
                <Alert variant="warning">{sessionClaimError}</Alert>
                <Button
                  type="button"
                  variant="outline-primary"
                  className="w-100"
                  onClick={() => {
                    void logout();
                  }}>
                  Sign out and try again
                </Button>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  if (user) {
    return <Loader height="100vh" />;
  }

  return (
    <div className="auth-box overflow-hidden align-items-center d-flex" style={{ minHeight: '100vh' }}>
      <Container>
        <Row className="justify-content-center">
          <Col xxl={4} md={6} sm={8}>
            <Card className="p-4">
              <div className="auth-brand text-center mb-4">
                <AppLogo />
                <p className="text-muted w-lg-75 mt-3 mx-auto">
                  Create your account to join <strong>{teamName}</strong>.
                </p>
              </div>
              {formError ? (
                <Alert variant="danger" className="mb-3 py-2">
                  {formError}
                </Alert>
              ) : null}
              <Form onSubmit={(e) => void handleSubmit(e)}>
                <div className="mb-3 form-group">
                  <FormLabel>
                    Name <span className="text-danger">*</span>
                  </FormLabel>
                  <FormControl
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-3 form-group">
                  <FormLabel>Email</FormLabel>
                  <FormControl type="email" value={invitedEmail} disabled readOnly className="bg-light" />
                </div>
                <div className="mb-3">
                  <PasswordInputWithStrength
                    id="invite-password"
                    label="Password"
                    name="password"
                    password={password}
                    setPassword={setPassword}
                    placeholder="••••••••"
                  />
                </div>
                <div className="mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input form-check-input-light fs-14"
                      type="checkbox"
                      id="inviteTerms"
                      checked={agreement}
                      onChange={() => setAgreement((v) => !v)}
                    />
                    <label className="form-check-label" htmlFor="inviteTerms">
                      I agree to the terms and policy
                    </label>
                  </div>
                </div>
                <div className="d-grid">
                  <Button type="submit" className="btn btn-primary fw-semibold py-2" disabled={busy}>
                    {busy ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" />
                        Creating account…
                      </>
                    ) : (
                      'Create account and join team'
                    )}
                  </Button>
                </div>
              </Form>
              <p className="text-muted text-center mt-4 mb-0">
                Already have an account?{' '}
                <Link to={ROUTE_PATHS.LOGIN} className="text-decoration-underline link-offset-3 fw-semibold">
                  Sign in
                </Link>
              </p>
            </Card>
            <p className="text-center text-muted mt-4 mb-0">© {currentYear} WPHub.Pro</p>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
