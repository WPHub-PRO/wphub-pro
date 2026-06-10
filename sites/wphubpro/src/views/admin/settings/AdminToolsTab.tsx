import {
  fetchAdminToolsMissingTeamSubscriptions,
  postAdminToolsBackfillTeamSubscriptions,
  postAdminToolsReconcileFreeTier,
  type AdminBackfillTeamSubscriptionsResult,
  type AdminMissingTeamCandidate,
  type AdminReconcileFreeTierResult,
} from '@/lib/stripeAdminApi';
import { createAiAccessLink, type CreateAiAccessLinkResult } from '@/domains/platform/aiAccessApi';
import AdminTeamBillingTab from '@/views/admin/finance/AdminTeamBillingTab';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';

const AI_ACCESS_TTL_OPTIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '24 hours', minutes: 1440 },
] as const;

function proceedableIds(candidates: AdminMissingTeamCandidate[]): string[] {
  return candidates.filter((c) => c.proceedable).map((c) => c.subscriptionId);
}

export default function AdminToolsTab() {
  const [aiLinkLoading, setAiLinkLoading] = useState(false);
  const [aiLinkErr, setAiLinkErr] = useState<string | null>(null);
  const [aiLinkResult, setAiLinkResult] = useState<CreateAiAccessLinkResult | null>(null);
  const [aiLinkTtlMinutes, setAiLinkTtlMinutes] = useState<number>(60);
  const [aiLinkLabel, setAiLinkLabel] = useState('');
  const [aiLinkCopied, setAiLinkCopied] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [candidates, setCandidates] = useState<AdminMissingTeamCandidate[]>([]);
  const [scanMeta, setScanMeta] = useState<{ examined: number; teamSubscriptions: number; skippedHasRow: number; skippedNotTeam: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [result, setResult] = useState<AdminBackfillTeamSubscriptionsResult | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<AdminReconcileFreeTierResult | null>(null);
  const [reconcileErr, setReconcileErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generateAiAccessLink = async () => {
    setAiLinkLoading(true);
    setAiLinkErr(null);
    setAiLinkResult(null);
    setAiLinkCopied(false);
    try {
      const r = await createAiAccessLink({
        ttlMinutes: aiLinkTtlMinutes,
        label: aiLinkLabel,
      });
      if (!r?.success || !r.url) {
        throw new Error(r?.message || 'Could not generate access link.');
      }
      setAiLinkResult(r);
    } catch (e) {
      setAiLinkErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setAiLinkLoading(false);
    }
  };

  const copyAiAccessLink = async () => {
    const url = aiLinkResult?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setAiLinkCopied(true);
      window.setTimeout(() => setAiLinkCopied(false), 2000);
    } catch {
      setAiLinkErr('Could not copy to clipboard.');
    }
  };

  const runReconcileFreeTier = async (cursorAfter?: string) => {
    const message = cursorAfter
      ? 'Continue with the next batch of account rows (using the server cursor from the previous response)?'
      : 'Run reconciliation for up to 500 account rows per batch. Creates Stripe customers and free-tier subscriptions where safe; skips users with paid plans.';
    if (!window.confirm(message)) {
      return;
    }
    setReconcileLoading(true);
    setReconcileErr(null);
    if (!cursorAfter) setReconcileResult(null);
    try {
      const r = await postAdminToolsReconcileFreeTier({
        limit: 500,
        ...(cursorAfter ? { cursorAfter } : {}),
      });
      setReconcileResult(r);
    } catch (e) {
      setReconcileErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setReconcileLoading(false);
    }
  };

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setErr(null);
    try {
      const data = await fetchAdminToolsMissingTeamSubscriptions();
      setCandidates(data.candidates);
      setScanMeta({
        examined: data.examined,
        teamSubscriptions: data.teamSubscriptions,
        skippedHasRow: data.skippedHasRow,
        skippedNotTeam: data.skippedNotTeam,
      });
      setSelectedIds(new Set(proceedableIds(data.candidates)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load list');
      setCandidates([]);
      setScanMeta(null);
      setSelectedIds(new Set());
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const proceedable = useMemo(() => candidates.filter((c) => c.proceedable), [candidates]);
  const selectedProceedableCount = useMemo(
    () => proceedable.filter((c) => selectedIds.has(c.subscriptionId)).length,
    [proceedable, selectedIds],
  );
  const allProceedableSelected =
    proceedable.length > 0 && proceedable.every((c) => selectedIds.has(c.subscriptionId));

  const toggleOne = (id: string, checked: boolean, canProceed: boolean) => {
    if (!canProceed) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllProceedable = (checked: boolean) => {
    setSelectedIds(checked ? new Set(proceedable.map((c) => c.subscriptionId)) : new Set());
  };

  const headerCheckRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    el.indeterminate = selectedProceedableCount > 0 && !allProceedableSelected;
  }, [selectedProceedableCount, allProceedableSelected]);

  const runConfirm = async () => {
    const ids = [...selectedIds].filter((id) => proceedable.some((c) => c.subscriptionId === id));
    if (ids.length === 0) {
      setErr('Select at least one subscription that can be provisioned.');
      return;
    }
    setConfirmLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await postAdminToolsBackfillTeamSubscriptions({ subscriptionIds: ids });
      setResult(r);
      await loadPreview();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <Row>
      <Col lg={11} xl={10}>
        <Card className="border">
          <Card.Body>
            <Card.Title as="h5">Tools</Card.Title>
            <Card.Text className="text-muted small">
              One-off maintenance actions for billing and team workspaces. Additional tools can be added here over time.
            </Card.Text>

            <hr className="my-3" />

            <Card.Subtitle as="h6" className="mb-2">
              AI / passwordless access link
            </Card.Subtitle>
            <p className="text-muted small mb-3">
              Generate a one-time link that signs in as <strong>your admin account</strong> without a password.
              Use it for AI tools or automated browsers that need to review layout and features. Each link expires
              after the chosen duration and can only be used once.
            </p>
            <Alert variant="warning" className="small py-2">
              Anyone with the link gets your admin session until it expires or is used. Share only with trusted tools
              and revoke access by not sharing further links.
            </Alert>
            <Row className="g-3 mb-3">
              <Col sm={6} md={4}>
                <Form.Group controlId="ai-access-ttl">
                  <Form.Label className="small text-muted">Link validity</Form.Label>
                  <Form.Select
                    value={aiLinkTtlMinutes}
                    disabled={aiLinkLoading}
                    onChange={(e) => setAiLinkTtlMinutes(Number(e.target.value))}>
                    {AI_ACCESS_TTL_OPTIONS.map((o) => (
                      <option key={o.minutes} value={o.minutes}>
                        {o.label}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col sm={6} md={8}>
                <Form.Group controlId="ai-access-label">
                  <Form.Label className="small text-muted">Label (optional)</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g. Cursor layout review"
                    value={aiLinkLabel}
                    disabled={aiLinkLoading}
                    onChange={(e) => setAiLinkLabel(e.target.value)}
                    maxLength={120}
                  />
                </Form.Group>
              </Col>
            </Row>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <Button
                variant="primary"
                type="button"
                disabled={aiLinkLoading}
                onClick={() => void generateAiAccessLink()}>
                {aiLinkLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" role="status" />
                    Generating…
                  </>
                ) : (
                  'Generate access link'
                )}
              </Button>
              {aiLinkResult?.url ? (
                <Button variant="outline-secondary" type="button" onClick={() => void copyAiAccessLink()}>
                  {aiLinkCopied ? 'Copied' : 'Copy link'}
                </Button>
              ) : null}
            </div>
            {aiLinkErr != null && aiLinkErr !== '' && (
              <Alert variant="danger" className="mb-3 small">
                {aiLinkErr}
              </Alert>
            )}
            {aiLinkResult?.url ? (
              <div className="mb-0">
                <Form.Label className="small text-muted">Temporary link</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  readOnly
                  className="font-monospace small user-select-all"
                  value={aiLinkResult.url}
                />
                {aiLinkResult.expiresAt ? (
                  <p className="text-muted small mt-2 mb-0">
                    Expires {new Date(aiLinkResult.expiresAt).toLocaleString()} · single use
                  </p>
                ) : null}
              </div>
            ) : null}

            <hr className="my-4" />

            <Card.Subtitle as="h6" className="mb-2">
              Team billing defaults &amp; free tier
            </Card.Subtitle>
            <p className="text-muted small mb-3">
              Default Stripe team plan prices and the personal free-tier price used for reconciliation.
            </p>
            <AdminTeamBillingTab />

            <hr className="my-4" />

            <Card.Subtitle as="h6" className="mb-2">
              Personal Stripe customers &amp; free tier
            </Card.Subtitle>
            <p className="text-muted small mb-3">
              Ensures each account has a Stripe customer, then attaches the configured free-tier subscription where missing.
              Users with an active paid or team subscription are skipped.
            </p>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <Button
                variant="primary"
                type="button"
                disabled={reconcileLoading}
                onClick={() => void runReconcileFreeTier()}>
                {reconcileLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" role="status" />
                    Running…
                  </>
                ) : (
                  'Reconcile free tier & Stripe customers'
                )}
              </Button>
              {reconcileResult != null && !reconcileResult.done && reconcileResult.nextCursor ? (
                <Button
                  variant="outline-primary"
                  type="button"
                  disabled={reconcileLoading}
                  onClick={() => void runReconcileFreeTier(reconcileResult.nextCursor ?? undefined)}>
                  Continue next batch
                </Button>
              ) : null}
            </div>
            {reconcileErr != null && reconcileErr !== '' && (
              <Alert variant="danger" className="mb-3 small">
                {reconcileErr}
              </Alert>
            )}
            {reconcileResult != null && (
              <pre className="small bg-light border rounded p-3 mb-3 overflow-auto" style={{ maxHeight: 280 }}>
                {JSON.stringify(reconcileResult, null, 2)}
              </pre>
            )}

            <hr className="my-3" />

            <Card.Subtitle as="h6" className="mb-2">
              Team workspaces from Stripe
            </Card.Subtitle>
            <p className="text-muted small mb-3">
              Active or trialing team-plan subscriptions without a team workspace yet appear below. Select rows to provision,
              then confirm. Rows that cannot be provisioned are listed for review with checkboxes disabled.
            </p>

            <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
              <Button variant="outline-secondary" type="button" disabled={previewLoading} onClick={() => void loadPreview()}>
                {previewLoading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" role="status" />
                    Loading…
                  </>
                ) : (
                  'Refresh list'
                )}
              </Button>
              {scanMeta != null && !previewLoading && (
                <span className="text-muted small">
                  Scan: {scanMeta.examined} subscriptions · {scanMeta.teamSubscriptions} team-product ·{' '}
                  {candidates.length} missing row · {proceedable.length} ready to create
                </span>
              )}
            </div>

            {previewLoading && candidates.length === 0 ? (
              <div className="d-flex align-items-center gap-2 text-muted py-4">
                <Spinner animation="border" size="sm" role="status" />
                Loading Stripe subscriptions…
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-muted small mb-0">No team-plan subscriptions are missing a team workspace.</p>
            ) : (
              <div className="table-responsive border rounded mb-3">
                <Table hover size="sm" className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 40 }}>
                        <Form.Check
                          ref={headerCheckRef}
                          type="checkbox"
                          aria-label="Select all provisionable"
                          checked={allProceedableSelected}
                          disabled={proceedable.length === 0}
                          onChange={(e) => toggleAllProceedable(e.target.checked)}
                        />
                      </th>
                      <th>Subscription</th>
                      <th>Status</th>
                      <th>Customer</th>
                      <th>Team name</th>
                      <th>Product</th>
                      <th>Owner</th>
                      <th className="text-end">Seats</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.subscriptionId} className={c.proceedable ? undefined : 'table-warning'}>
                        <td>
                          <Form.Check
                            type="checkbox"
                            checked={c.proceedable && selectedIds.has(c.subscriptionId)}
                            disabled={!c.proceedable}
                            onChange={(e) => toggleOne(c.subscriptionId, e.target.checked, c.proceedable)}
                            aria-label={`Select ${c.subscriptionId}`}
                          />
                        </td>
                        <td>
                          <code className="user-select-all small">{c.subscriptionId}</code>
                        </td>
                        <td>{c.status}</td>
                        <td>
                          <div className="small">
                            <code className="user-select-all">{c.customerId || '—'}</code>
                          </div>
                          {(c.customerName || c.customerEmail) && (
                            <div className="text-muted text-truncate" style={{ maxWidth: 200 }} title={c.customerEmail ?? ''}>
                              {c.customerName || c.customerEmail}
                            </div>
                          )}
                        </td>
                        <td className="small">{c.teamName}</td>
                        <td className="small text-truncate" style={{ maxWidth: 160 }} title={c.productName ?? ''}>
                          {c.productName || c.productId || '—'}
                        </td>
                        <td>
                          <code className="user-select-all small">{c.ownerUserId || '—'}</code>
                        </td>
                        <td className="text-end small">{c.maxSeats != null ? c.maxSeats : '—'}</td>
                        <td className="small text-danger">{c.blockReason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            <Button
              variant="primary"
              type="button"
              disabled={confirmLoading || previewLoading || selectedProceedableCount === 0}
              onClick={() => void runConfirm()}>
              {confirmLoading ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" role="status" />
                  Creating…
                </>
              ) : (
                `Confirm: create team workspaces (${selectedProceedableCount} selected)`
              )}
            </Button>

            {selectedProceedableCount === 0 && candidates.length > 0 && proceedable.length > 0 && (
              <p className="text-muted small mt-2 mb-0">Select at least one row above to enable Confirm.</p>
            )}

            {err != null && err !== '' && (
              <Alert variant="danger" className="mt-3 mb-0 small">
                {err}
              </Alert>
            )}

            {result != null && (
              <pre className="small bg-light border rounded p-3 mt-3 mb-0 overflow-auto" style={{ maxHeight: 280 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
