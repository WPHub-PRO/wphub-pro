import { createAiAccessLink, type CreateAiAccessLinkResult } from '@/domains/platform/aiAccessApi';
import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';

const AI_ACCESS_TTL_OPTIONS = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '4 hours', minutes: 240 },
  { label: '24 hours', minutes: 1440 },
] as const;

export default function AdminAiAccessLinkPanel() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAiAccessLinkResult | null>(null);
  const [ttlMinutes, setTtlMinutes] = useState<number>(60);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    setErr(null);
    setResult(null);
    setCopied(false);
    try {
      const r = await createAiAccessLink({ ttlMinutes, label });
      if (!r?.success || !r.url) {
        throw new Error(r?.message || 'Could not generate access link.');
      }
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    const url = result?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Could not copy to clipboard.');
    }
  };

  return (
    <Card id="admin-ai-access-link" className="border mb-3">
      <Card.Body>
        <Card.Title as="h5">AI / passwordless access link</Card.Title>
        <Card.Text className="text-muted small">
          Generate a one-time link that signs in as <strong>your admin account</strong> without a password. Use it for AI
          tools or automated browsers that need to review layout and features. Each link expires after the chosen duration
          and can only be used once.
        </Card.Text>
        <Alert variant="warning" className="small py-2">
          Anyone with the link gets your admin session until it expires or is used. Share only with trusted tools.
        </Alert>
        <Row className="g-3 mb-3">
          <Col sm={6} md={4}>
            <Form.Group controlId="ai-access-ttl">
              <Form.Label className="small text-muted">Link validity</Form.Label>
              <Form.Select
                value={ttlMinutes}
                disabled={loading}
                onChange={(e) => setTtlMinutes(Number(e.target.value))}>
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
                value={label}
                disabled={loading}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
              />
            </Form.Group>
          </Col>
        </Row>
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <Button variant="primary" type="button" disabled={loading} onClick={() => void generateLink()}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" role="status" />
                Generating…
              </>
            ) : (
              'Generate access link'
            )}
          </Button>
          {result?.url ? (
            <Button variant="outline-secondary" type="button" onClick={() => void copyLink()}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          ) : null}
        </div>
        {err != null && err !== '' && (
          <Alert variant="danger" className="mb-3 small">
            {err}
          </Alert>
        )}
        {result?.url ? (
          <div className="mb-0">
            <Form.Label className="small text-muted">Temporary link</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              readOnly
              className="font-monospace small user-select-all"
              value={result.url}
            />
            {result.expiresAt ? (
              <p className="text-muted small mt-2 mb-0">
                Expires {new Date(result.expiresAt).toLocaleString()} · single use
              </p>
            ) : null}
          </div>
        ) : null}
      </Card.Body>
    </Card>
  );
}
