import { useNotificationContext } from '@/context/useNotificationContext';
import {
  usePlatformApiEnvList,
  usePlatformApiEnvSave,
  type PlatformApiEnvRow,
} from '@/views/admin/settings/usePlatformSettings';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import { TbPlus, TbTrash } from 'react-icons/tb';

const SUGGESTED_KEYS = [
  { key: 'GOOGLE_PAGESPEED_API_KEY', hint: 'PageSpeed Insights API (used by sites)' },
  { key: 'GOOGLE_CLOUD_API_KEY', hint: 'Google Cloud Console API key (optional)' },
];

type RepeaterRow = PlatformApiEnvRow & { id: string };

function newRow(key = '', value = ''): RepeaterRow {
  return { id: crypto.randomUUID(), key, value };
}

function normalizeRows(items: PlatformApiEnvRow[]): RepeaterRow[] {
  if (!items.length) {
    return SUGGESTED_KEYS.map((s) => newRow(s.key, ''));
  }
  return items.map((r) => newRow(r.key, r.value ?? ''));
}

const AdminApiTab = () => {
  const { showNotification } = useNotificationContext();
  const { data, isLoading, isError, error, refetch } = usePlatformApiEnvList();
  const save = usePlatformApiEnvSave();
  const [rows, setRows] = useState<RepeaterRow[]>(() => SUGGESTED_KEYS.map((s) => newRow(s.key, '')));

  useEffect(() => {
    if (!data?.items) return;
    setRows(normalizeRows(data.items));
  }, [data?.items]);

  const scope = data?.scope ?? 'project';

  const updateRow = (id: string, patch: Partial<PlatformApiEnvRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addSuggested = () => {
    setRows((prev) => {
      const have = new Set(prev.map((r) => r.key.trim().toUpperCase()));
      const extra = SUGGESTED_KEYS.filter((s) => !have.has(s.key)).map((s) => newRow(s.key, ''));
      return extra.length ? [...prev, ...extra] : prev;
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const entries = rows
      .map((r) => ({ key: r.key.trim(), value: r.value }))
      .filter((r) => r.key.length > 0);
    if (entries.length === 0) {
      showNotification({
        title: 'Nothing to save',
        message: 'Add at least one variable with a key.',
        variant: 'warning',
      });
      return;
    }
    try {
      const res = await save.mutateAsync(entries);
      showNotification({
        title: 'Saved',
        message: res?.message ?? 'Global variables saved on the Appwrite project.',
        variant: 'success',
      });
    } catch (err) {
      showNotification({
        title: 'Save failed',
        message: err instanceof Error ? err.message : String(err),
        variant: 'danger',
      });
    }
  };

  return (
    <Row>
      <Col xs={12} lg={10} xl={8}>
        <Card className="border">
          <Card.Body>
            <Card.Title as="h5">API · global project variables</Card.Title>
            <Card.Text className="text-muted small">
              Add key/value pairs as Appwrite project global variables ({scope}). They are available to every function
              and site at runtime. Use uppercase names (e.g. <code>GOOGLE_PAGESPEED_API_KEY</code>). Redeploy functions
              after changing values if a deployment was already active.
            </Card.Text>

            {isLoading && (
              <div className="d-flex align-items-center gap-2 text-muted py-3">
                <Spinner animation="border" size="sm" role="status" />
                Loading environment variables…
              </div>
            )}

            {isError && !isLoading && (
              <Alert variant="danger" className="small">
                {error instanceof Error ? error.message : 'Could not load API environment variables.'}{' '}
                <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => void refetch()}>
                  Retry
                </Button>
              </Alert>
            )}

            {!isLoading && !isError && (
              <Form onSubmit={(e) => void onSubmit(e)}>
                {rows.length === 0 ? (
                  <Alert variant="secondary" className="small">
                    No variables yet. Add one below or use suggested keys.
                  </Alert>
                ) : null}

                {rows.map((row, idx) => {
                  const hint = SUGGESTED_KEYS.find((s) => s.key === row.key.trim().toUpperCase())?.hint;
                  return (
                    <Card key={row.id} className="mb-3 border bg-body-secondary">
                      <Card.Body>
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                          <h6 className="mb-0 text-muted text-uppercase fs-xs fw-semibold">
                            Variable {idx + 1}
                          </h6>
                          <Button
                            type="button"
                            variant="outline-danger"
                            size="sm"
                            onClick={() => removeRow(row.id)}
                          >
                            <TbTrash className="me-1" aria-hidden />
                            Remove
                          </Button>
                        </div>
                        <Row className="g-3">
                          <Col md={5}>
                            <Form.Group controlId={`api-env-key-${row.id}`}>
                              <Form.Label>Key</Form.Label>
                              <Form.Control
                                value={row.key}
                                onChange={(e) => updateRow(row.id, { key: e.target.value })}
                                placeholder="GOOGLE_PAGESPEED_API_KEY"
                                autoComplete="off"
                                className="font-monospace"
                              />
                              {hint ? <Form.Text className="text-muted">{hint}</Form.Text> : null}
                            </Form.Group>
                          </Col>
                          <Col md={7}>
                            <Form.Group controlId={`api-env-value-${row.id}`}>
                              <Form.Label>Value</Form.Label>
                              <Form.Control
                                type="text"
                                value={row.value}
                                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                                placeholder="Value"
                                autoComplete="off"
                                className="font-monospace"
                              />
                              <Form.Text className="text-muted">
                                Leave empty when saving to remove this global variable.
                              </Form.Text>
                            </Form.Group>
                          </Col>
                        </Row>
                      </Card.Body>
                    </Card>
                  );
                })}

                <div className="d-flex flex-wrap gap-2 mb-4">
                  <Button type="button" size="sm" variant="outline-secondary" onClick={addRow}>
                    <TbPlus className="me-1" aria-hidden />
                    Add variable
                  </Button>
                  <Button type="button" size="sm" variant="outline-secondary" onClick={addSuggested}>
                    Add suggested keys
                  </Button>
                </div>

                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save global variables'}
                </Button>
              </Form>
            )}
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default AdminApiTab;
