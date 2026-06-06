import { DocHelpButton } from '@/components/docs/DocHelpButton';
import GrapesHtmlSnippetTabs from '@/components/email-builder/GrapesHtmlSnippetTabs';
import { useNotificationContext } from '@/context/useNotificationContext';
import {
  SYSTEM_EMAIL_EVENT_OPTIONS,
  SYSTEM_EMAIL_SHORTCODE_HELP,
  type SystemEmailEventKey,
} from '@/domains/system-email/events';
import {
  blocksDocToHtml,
  defaultBlocksForEvent,
  emailBodyDocFromHtmlFragment,
  hydrateBlocksFromBodyHtml,
  serializeBlocksDoc,
  type EmailBlocksDoc,
} from '@/domains/system-email/emailBlocks';
import {
  useEmailDelivery,
  useEmailDeliveryUpsert,
  useEmailPreview,
  useEmailShell,
  useEmailShellUpsert,
  useEmailTemplateUpsert,
  useEmailTemplatesList,
  useEmailTestSend,
} from '@/domains/system-email/hooks';
import EmailBlockBuilder from '@/views/admin/settings/EmailBlockBuilder';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  Nav,
  Row,
  Spinner,
} from 'react-bootstrap';

const GrapesEmailEditor = lazy(() => import('@/components/email-builder/GrapesEmailEditor'));

export default function SystemEmailBuilderTab() {
  const { showNotification } = useNotificationContext();

  const deliveryQ = useEmailDelivery();
  const shellQ = useEmailShell();
  const templatesQ = useEmailTemplatesList();

  const upsertDelivery = useEmailDeliveryUpsert();
  const upsertShell = useEmailShellUpsert();
  const upsertTpl = useEmailTemplateUpsert();
  const previewMut = useEmailPreview();
  const testSend = useEmailTestSend();

  const [provider, setProvider] = useState('webhook');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testTo, setTestTo] = useState('');
  const [shortcodesOpen, setShortcodesOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    subject?: string;
    html?: string;
    usedDbTemplate?: boolean;
  } | null>(null);

  const [headerHtml, setHeaderHtml] = useState('');
  const [footerHtml, setFooterHtml] = useState('');

  const [editEvent, setEditEvent] = useState<SystemEmailEventKey>('team_invite');
  const [tplDocId, setTplDocId] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [blocksDoc, setBlocksDoc] = useState<EmailBlocksDoc>(() =>
    hydrateBlocksFromBodyHtml('', 'team_invite'),
  );
  const [tplEnabled, setTplEnabled] = useState(true);
  const [bodyTab, setBodyTab] = useState<'visual' | 'blocks' | 'source'>('visual');
  const [grapesBodyKey, setGrapesBodyKey] = useState(0);

  const deliverySettings =
    deliveryQ.data && typeof deliveryQ.data === 'object' && 'settings' in deliveryQ.data
      ? (deliveryQ.data as { settings?: Record<string, unknown>; hasResendKey?: boolean })
      : undefined;

  useEffect(() => {
    const s = deliverySettings?.settings;
    if (!s || typeof s !== 'object') return;
    setProvider(String(s.provider || 'webhook'));
    setFromEmail(String(s.from_email || ''));
    setFromName(String(s.from_name || ''));
    setReplyTo(String(s.reply_to || ''));
    setWebhookUrl(String(s.webhook_url || ''));
  }, [deliverySettings]);

  useEffect(() => {
    const shell = shellQ.data && typeof shellQ.data === 'object' && 'shell' in shellQ.data ? shellQ.data.shell : undefined;
    if (!shell) return;
    setHeaderHtml(shell.header_html ?? '');
    setFooterHtml(shell.footer_html ?? '');
  }, [shellQ.data]);

  const itemsByEvent = useMemo(() => {
    const raw =
      templatesQ.data && typeof templatesQ.data === 'object' && 'items' in templatesQ.data
        ? (templatesQ.data as { items?: unknown }).items
        : undefined;
    const list = Array.isArray(raw) ? raw : [];
    const m = new Map<string, (typeof list)[0]>();
    for (const row of list) {
      if (row.event_key) m.set(String(row.event_key), row);
    }
    return m;
  }, [templatesQ.data]);

  useEffect(() => {
    const row = itemsByEvent.get(editEvent);
    if (row) {
      setTplDocId(row.$id);
      setTplTitle(row.title || '');
      setTplSubject(row.subject || '');
      setBlocksDoc(hydrateBlocksFromBodyHtml(String(row.body_html || ''), editEvent));
      setTplEnabled(row.enabled !== false);
    } else {
      setTplDocId('');
      const opt = SYSTEM_EMAIL_EVENT_OPTIONS.find((o) => o.value === editEvent);
      setTplTitle(opt?.label ?? editEvent);
      setTplSubject('');
      setBlocksDoc(hydrateBlocksFromBodyHtml('', editEvent));
      setTplEnabled(true);
    }
  }, [editEvent, itemsByEvent, templatesQ.data]);

  useEffect(() => {
    setGrapesBodyKey((n) => n + 1);
  }, [editEvent, tplDocId]);

  const notifyErr = (err: unknown) =>
    showNotification({
      title: 'Error',
      message: err instanceof Error ? err.message : 'Request failed',
      variant: 'danger',
    });

  const saveDelivery = async () => {
    try {
      await upsertDelivery.mutateAsync({
        provider,
        from_email: fromEmail.trim(),
        from_name: fromName.trim(),
        reply_to: replyTo.trim(),
        webhook_url: webhookUrl.trim(),
      });
      showNotification({ title: 'Saved', message: 'Email delivery settings updated.', variant: 'success' });
    } catch (e) {
      notifyErr(e);
    }
  };

  const saveShell = async () => {
    try {
      await upsertShell.mutateAsync({
        header_html: headerHtml,
        footer_html: footerHtml,
      });
      showNotification({ title: 'Saved', message: 'Global header/footer updated.', variant: 'success' });
    } catch (e) {
      notifyErr(e);
    }
  };

  const saveTemplate = async () => {
    try {
      await upsertTpl.mutateAsync({
        documentId: tplDocId || undefined,
        event_key: editEvent,
        title: tplTitle.trim(),
        subject: tplSubject.trim(),
        body_html: serializeBlocksDoc(blocksDoc),
        enabled: tplEnabled,
      });
      showNotification({ title: 'Saved', message: 'Template saved.', variant: 'success' });
    } catch (e) {
      notifyErr(e);
    }
  };

  const runPreview = async () => {
    try {
      const r = await previewMut.mutateAsync({ event_key: editEvent });
      setPreviewResult({
        subject: r.subject,
        html: r.html,
        usedDbTemplate: r.usedDbTemplate,
      });
      showNotification({ title: 'Preview ready', message: 'Rendered subject and HTML below.', variant: 'info' });
    } catch (e) {
      notifyErr(e);
    }
  };

  const sendTest = async () => {
    const to = testTo.trim();
    if (!to) {
      showNotification({ title: 'Email required', message: 'Enter a recipient for the test.', variant: 'warning' });
      return;
    }
    try {
      const res = await testSend.mutateAsync({ to });
      showNotification({
        title: res.via ? `Sent (${res.via})` : 'Sent',
        message: res.success ? 'Check the inbox (and spam).' : 'Delivery skipped — check provider settings.',
        variant: res.success ? 'success' : 'warning',
      });
    } catch (e) {
      notifyErr(e);
    }
  };

  const loading = deliveryQ.isLoading || shellQ.isLoading || templatesQ.isLoading;

  const preview = previewResult;

  return (
    <>
      <Row className="mb-3">
        <Col>
          <div className="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <p className="text-muted small mb-0">
              Edit transactional email templates and delivery settings. Messages are sent server-side via{' '}
              <strong>Resend</strong> or your configured HTTPS webhook.
            </p>
            <DocHelpButton contextKey="admin:communication:system-emails" />
          </div>
        </Col>
      </Row>

      {loading && (
        <div className="d-flex align-items-center gap-2 text-muted py-3">
          <Spinner animation="border" size="sm" />
          Loading email settings…
        </div>
      )}

      {!loading && (
        <>
          <Card className="border mb-4">
            <Card.Body>
              <Card.Title as="h5">Email delivery (Resend / webhook)</Card.Title>
              {deliverySettings?.hasResendKey === false && provider === 'resend' && (
                <Alert variant="warning" className="small py-2">
                  Resend is selected but outbound mail is not configured yet. Messages may use the webhook fallback or
                  remain unsent until delivery is set up on the server.
                </Alert>
              )}
              <Row className="g-2 mb-2">
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>Provider</Form.Label>
                    <Form.Select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      disabled={upsertDelivery.isPending}>
                      <option value="webhook">Webhook (HTTPS POST JSON)</option>
                      <option value="resend">Resend API</option>
                      <option value="none">None (dry run — no send)</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>From email</Form.Label>
                    <Form.Control
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="noreply@yourdomain.com"
                      autoComplete="off"
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>From name</Form.Label>
                    <Form.Control
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="WP Hub Pro"
                      autoComplete="off"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Row className="g-2 mb-2">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Reply-To (optional)</Form.Label>
                    <Form.Control
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      autoComplete="off"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Webhook URL (optional override)</Form.Label>
                    <Form.Control
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://your-server/webhooks/transactional-email"
                      autoComplete="off"
                    />
                  </Form.Group>
                </Col>
              </Row>
              <Button variant="primary" size="sm" type="button" disabled={upsertDelivery.isPending} onClick={() => void saveDelivery()}>
                {upsertDelivery.isPending ? 'Saving…' : 'Save delivery settings'}
              </Button>

              <hr className="my-4" />

              <Form.Label className="fw-semibold">Send test email</Form.Label>
              <Row className="g-2 align-items-end">
                <Col md={6}>
                  <Form.Control
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Col>
                <Col md="auto">
                  <Button variant="outline-secondary" size="sm" type="button" disabled={testSend.isPending} onClick={() => void sendTest()}>
                    {testSend.isPending ? 'Sending…' : 'Send test'}
                  </Button>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="border mb-4">
            <Card.Body>
              <Card.Title as="h5">Global HTML wrapper</Card.Title>
              <p className="text-muted small">
                Body templates below are inserted between header and footer. Leave empty to use only the template body.
              </p>
              <Form.Group className="mb-2">
                <Form.Label>Header HTML</Form.Label>
                <GrapesHtmlSnippetTabs
                  idPrefix="email-shell-header"
                  fieldKey="shell-header"
                  value={headerHtml}
                  onChange={setHeaderHtml}
                  height="300px"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Footer HTML</Form.Label>
                <GrapesHtmlSnippetTabs
                  idPrefix="email-shell-footer"
                  fieldKey="shell-footer"
                  value={footerHtml}
                  onChange={setFooterHtml}
                  height="300px"
                />
              </Form.Group>
              <Button variant="primary" size="sm" type="button" disabled={upsertShell.isPending} onClick={() => void saveShell()}>
                {upsertShell.isPending ? 'Saving…' : 'Save header/footer'}
              </Button>
            </Card.Body>
          </Card>

          <Card className="border mb-4">
            <Card.Body>
              <Card.Title as="h5">Templates by event</Card.Title>
              <Row className="g-2 mb-3">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Event</Form.Label>
                    <Form.Select
                      value={editEvent}
                      onChange={(e) => setEditEvent(e.target.value as SystemEmailEventKey)}>
                      {SYSTEM_EMAIL_EVENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
              <Form.Group className="mb-2">
                <Form.Label>Admin title</Form.Label>
                <Form.Control value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Subject (shortcodes allowed)</Form.Label>
                <Form.Control value={tplSubject} onChange={(e) => setTplSubject(e.target.value)} />
              </Form.Group>
              <div className="mb-2">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                  <Form.Label className="mb-0">Body</Form.Label>
                  <Button
                    variant="link"
                    size="sm"
                    className="py-0"
                    type="button"
                    onClick={() => {
                      setBlocksDoc(defaultBlocksForEvent(editEvent));
                      setGrapesBodyKey((n) => n + 1);
                    }}>
                    Reset to defaults for this event
                  </Button>
                </div>
                <p className="text-muted small mb-2">
                  Edit with the visual builder (GrapesJS + newsletter blocks, CSS inlined on save), structured blocks, or
                  raw HTML. Stored as JSON in <code className="user-select-all">body_html</code> (single raw-HTML block
                  when using Grapes/source). Shortcodes like <code>{'{{team_name}}'}</code> work in text and links.
                </p>
                <Nav variant="tabs" className="mb-2 flex-nowrap" activeKey={bodyTab}>
                  <Nav.Item>
                    <Nav.Link
                      eventKey="visual"
                      active={bodyTab === 'visual'}
                      onClick={() => {
                        if (bodyTab !== 'visual') setGrapesBodyKey((n) => n + 1);
                        setBodyTab('visual');
                      }}>
                      Visual
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="blocks" active={bodyTab === 'blocks'} onClick={() => setBodyTab('blocks')}>
                      Blocks
                    </Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="source" active={bodyTab === 'source'} onClick={() => setBodyTab('source')}>
                      Source
                    </Nav.Link>
                  </Nav.Item>
                </Nav>
                {bodyTab === 'visual' ? (
                  <Suspense
                    fallback={
                      <div className="d-flex align-items-center gap-2 text-muted py-4 justify-content-center border rounded">
                        <Spinner animation="border" size="sm" />
                        Loading visual editor…
                      </div>
                    }>
                    <GrapesEmailEditor
                      key={`body-${editEvent}-${tplDocId}-${grapesBodyKey}`}
                      initialHtml={blocksDocToHtml(blocksDoc)}
                      onChange={(html) => setBlocksDoc(emailBodyDocFromHtmlFragment(html, blocksDoc))}
                      height="560px"
                    />
                  </Suspense>
                ) : null}
                {bodyTab === 'blocks' ? <EmailBlockBuilder value={blocksDoc} onChange={setBlocksDoc} /> : null}
                {bodyTab === 'source' ? (
                  <Form.Control
                    as="textarea"
                    rows={14}
                    value={blocksDocToHtml(blocksDoc)}
                    onChange={(e) => setBlocksDoc(emailBodyDocFromHtmlFragment(e.target.value, blocksDoc))}
                    spellCheck={false}
                    className="font-monospace small"
                  />
                ) : null}
              </div>
              <Form.Check
                type="switch"
                id="tpl-enabled"
                className="mb-3"
                label="Enabled (if off, built-in default is used)"
                checked={tplEnabled}
                onChange={(e) => setTplEnabled(e.target.checked)}
              />
              <div className="d-flex flex-wrap gap-2">
                <Button variant="primary" size="sm" type="button" disabled={upsertTpl.isPending} onClick={() => void saveTemplate()}>
                  {upsertTpl.isPending ? 'Saving…' : 'Save template'}
                </Button>
                <Button variant="outline-primary" size="sm" type="button" disabled={previewMut.isPending} onClick={() => void runPreview()}>
                  {previewMut.isPending ? 'Rendering…' : 'Preview with sample data'}
                </Button>
              </div>

              {preview?.subject != null && (
                <div className="mt-4 p-3 bg-light rounded border">
                  <p className="small text-muted mb-1">
                    Preview subject {preview.usedDbTemplate === false ? '(built-in default)' : '(database template)'}
                  </p>
                  <p className="fw-semibold mb-2">{preview.subject}</p>
                  <div className="border rounded p-2 bg-white" style={{ maxHeight: 280, overflow: 'auto' }}>
                    <iframe title="email-preview" srcDoc={preview.html || ''} className="w-100 border-0" style={{ minHeight: 200 }} />
                  </div>
                </div>
              )}

              <Button
                variant="link"
                size="sm"
                className="px-0 mt-3"
                onClick={() => setShortcodesOpen(!shortcodesOpen)}>
                {shortcodesOpen ? 'Hide' : 'Show'} shortcode reference
              </Button>
              <Collapse in={shortcodesOpen}>
                <ul className="small text-muted mb-0">
                  {SYSTEM_EMAIL_SHORTCODE_HELP.map((row) => (
                    <li key={row.token}>
                      <code>{row.token}</code> — {row.description}
                    </li>
                  ))}
                </ul>
              </Collapse>
            </Card.Body>
          </Card>
        </>
      )}
    </>
  );
}
