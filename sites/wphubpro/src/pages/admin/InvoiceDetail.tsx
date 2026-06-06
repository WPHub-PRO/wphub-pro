import { DocHelpButton } from '@/components/docs/DocHelpButton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAdminInvoiceSendReminder, useAdminStripeInvoice, useAdminSubscriptionDetails } from '@/domains/admin/finance/hooks';
import { formatStripeAddress } from '@/lib/adminStripeFormat';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap';
import { Link, useParams } from 'react-router';

function formatMoney(cents: unknown, currency: unknown) {
  if (typeof cents !== 'number') return '—';
  const cur = typeof currency === 'string' ? currency : 'usd';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: cur.toUpperCase(),
  }).format(cents / 100);
}

function badgeBgForInvoiceStatus(status: unknown): string {
  const s = typeof status === 'string' ? status : '';
  switch (s) {
    case 'paid':
      return 'success';
    case 'open':
      return 'warning';
    case 'draft':
    case 'void':
    case 'uncollectible':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function subscriptionIdFromInvoice(inv: Record<string, unknown>): string {
  const sub = inv.subscription;
  if (typeof sub === 'string' && sub.startsWith('sub_')) return sub;
  if (sub && typeof sub === 'object' && 'id' in sub && typeof (sub as { id: unknown }).id === 'string') {
    return String((sub as { id: string }).id);
  }
  return '';
}

function extractInvoicePayments(inv: Record<string, unknown>): Record<string, unknown>[] {
  const payments = inv.payments as { data?: unknown[] } | undefined;
  const rows = Array.isArray(payments?.data) ? payments.data : [];
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const p = r.payment;
    if (p && typeof p === 'object') out.push(p as Record<string, unknown>);
    else out.push(r);
  }
  if (out.length === 0 && inv.payment_intent) {
    const pi = inv.payment_intent;
    if (typeof pi === 'object' && pi) out.push(pi as Record<string, unknown>);
  }
  return out;
}

const InvoiceDetailPage = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { data, isLoading, error } = useAdminStripeInvoice(invoiceId);
  const sendReminder = useAdminInvoiceSendReminder();
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);

  const inv = data?.invoice as Record<string, unknown> | undefined;
  const subscriptionId = useMemo(() => (inv ? subscriptionIdFromInvoice(inv) : ''), [inv]);
  const { data: subData } = useAdminSubscriptionDetails(subscriptionId || undefined);

  if (!invoiceId) return <p className="text-danger">Missing invoice id.</p>;
  if (isLoading) return <Spinner animation="border" />;
  if (error || !inv) {
    return (
      <div>
        <p className="text-danger">{error?.message ?? 'Not found'}</p>
        <Link to={ROUTE_PATHS.ADMIN_FINANCE_INVOICES}>Back to invoices</Link>
      </div>
    );
  }

  const customer = inv.customer as Record<string, unknown> | string | undefined;
  const c =
    typeof customer === 'object' && customer
      ? (customer as Record<string, unknown>)
      : null;

  const lines = (inv.lines as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
  const payments = extractInvoicePayments(inv);
  const statusStr = String(inv.status ?? '');
  const canRemind = statusStr === 'open' || statusStr === 'draft';

  const sub = subData?.subscription as Record<string, unknown> | undefined;
  const subCustomer = subData?.customer as Record<string, unknown> | null | undefined;

  const invoiceTitle =
    typeof inv.number === 'string' && inv.number.trim()
      ? `Invoice ${inv.number}`
      : `Invoice ${String(inv.id)}`;

  return (
    <div>
      <PageBreadcrumb
        title={invoiceTitle}
        subtitle="Finance"
        titleEnd={
          <span className="d-inline-flex flex-wrap align-items-center gap-2">
            <DocHelpButton contextKey="admin:finance:invoice-detail" />
            <Link to={ROUTE_PATHS.ADMIN_FINANCE_INVOICES} className="btn btn-sm btn-soft-secondary">
              ← Invoices
            </Link>
            {canRemind ? (
              <Button
                variant="outline-primary"
                size="sm"
                disabled={sendReminder.isPending}
                onClick={() => sendReminder.mutate(invoiceId)}
              >
                {sendReminder.isPending ? 'Sending…' : 'Send payment reminder'}
              </Button>
            ) : null}
          </span>
        }
      />
      {sendReminder.isError ? (
        <p className="text-danger small">{sendReminder.error?.message}</p>
      ) : null}
      {sendReminder.isSuccess ? <p className="text-success small">Reminder queued.</p> : null}

      <Row className="g-3">
        <Col lg={7}>
          <Card className="border shadow-none">
            <Card.Body>
              <h6 className="mb-3">Invoice</h6>
              <Table size="sm" borderless className="mb-0">
                <tbody className="small">
                  <tr>
                    <th className="text-muted">Status</th>
                    <td>
                      <Badge bg={badgeBgForInvoiceStatus(inv.status)}>{statusStr}</Badge>
                    </td>
                  </tr>
                  <tr>
                    <th className="text-muted">Amount due</th>
                    <td>{formatMoney(inv.amount_due, inv.currency)}</td>
                  </tr>
                  <tr>
                    <th className="text-muted">Amount paid</th>
                    <td>{formatMoney(inv.amount_paid, inv.currency)}</td>
                  </tr>
                  <tr>
                    <th className="text-muted">Created</th>
                    <td>
                      {typeof inv.created === 'number' ? new Date(inv.created * 1000).toLocaleString() : '—'}
                    </td>
                  </tr>
                  <tr>
                    <th className="text-muted">Due date</th>
                    <td>
                      {typeof inv.due_date === 'number' && inv.due_date > 0
                        ? new Date(inv.due_date * 1000).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                  <tr>
                    <th className="text-muted">Hosted invoice</th>
                    <td>
                      {typeof inv.hosted_invoice_url === 'string' ? (
                        <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th className="text-muted">PDF</th>
                    <td>
                      {typeof inv.invoice_pdf === 'string' ? (
                        <a href={inv.invoice_pdf} target="_blank" rel="noreferrer">
                          Open PDF
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="border shadow-none">
            <Card.Body>
              <h6 className="mb-3">Customer</h6>
              {c ? (
                <Table size="sm" borderless className="mb-0">
                  <tbody className="small">
                    <tr>
                      <th className="text-muted">Email</th>
                      <td>{typeof c.email === 'string' ? c.email : '—'}</td>
                    </tr>
                    <tr>
                      <th className="text-muted">Name</th>
                      <td>{typeof c.name === 'string' ? c.name : '—'}</td>
                    </tr>
                    <tr>
                      <th className="text-muted">Address</th>
                      <td>{formatStripeAddress(c.address)}</td>
                    </tr>
                    <tr>
                      <th className="text-muted">Stripe id</th>
                      <td className="font-monospace small">{typeof c.id === 'string' ? c.id : '—'}</td>
                    </tr>
                  </tbody>
                </Table>
              ) : (
                <p className="text-muted small mb-0">—</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {subscriptionId ? (
        <Card className="border shadow-none mt-3">
          <Card.Body>
            <h6 className="mb-3">Subscription</h6>
            <p className="small mb-2">
              <Link to={ROUTE_PATHS.adminFinanceSubscriptionPath(subscriptionId)}>{subscriptionId}</Link>
            </p>
            {sub ? (
              <Table size="sm" borderless className="mb-0 small">
                <tbody>
                  <tr>
                    <th className="text-muted">Status</th>
                    <td>{String(sub.status ?? '—')}</td>
                  </tr>
                  <tr>
                    <th className="text-muted">Current period end</th>
                    <td>
                      {typeof sub.current_period_end === 'number'
                        ? new Date(sub.current_period_end * 1000).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </Table>
            ) : (
              <p className="text-muted small mb-0">Loading subscription…</p>
            )}
            {subCustomer && typeof subCustomer === 'object' ? (
              <p className="text-muted small mb-0 mt-2">
                Customer: {typeof subCustomer.email === 'string' ? subCustomer.email : '—'}
              </p>
            ) : null}
          </Card.Body>
        </Card>
      ) : null}

      <Card className="border shadow-none mt-3">
        <Card.Body>
          <h6 className="mb-3">Payments</h6>
          {!payments.length ? (
            <p className="text-muted small mb-0">No separate payment records on this invoice.</p>
          ) : (
            <div className="d-flex flex-column gap-2">
              {payments.map((p) => {
                const id = String(p.id ?? '');
                const open = openPaymentId === id;
                return (
                  <div key={id || JSON.stringify(p)} className="border rounded p-2">
                    <button
                      type="button"
                      className="btn btn-link text-start text-decoration-none p-0 w-100 d-flex justify-content-between align-items-center"
                      onClick={() => setOpenPaymentId(open ? null : id)}
                    >
                      <span className="font-monospace small">{id || '—'}</span>
                      <span className="small text-muted">{open ? 'Hide' : 'Show'} detail</span>
                    </button>
                    <Collapse in={open}>
                      <div className="mt-2 small">
                        <pre className="mb-0 p-2 bg-light rounded overflow-auto" style={{ maxHeight: 280 }}>
                          {JSON.stringify(p, null, 2)}
                        </pre>
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>
          )}
        </Card.Body>
      </Card>

      <Card className="border shadow-none mt-3">
        <Card.Body>
          <h6 className="mb-3">Line items</h6>
          <Table responsive size="sm" className="mb-0">
            <thead className="small text-muted">
              <tr>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const l = line as Record<string, unknown>;
                return (
                  <tr key={String(l.id)}>
                    <td>{typeof l.description === 'string' ? l.description : '—'}</td>
                    <td>{formatMoney(l.amount, inv.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default InvoiceDetailPage;
