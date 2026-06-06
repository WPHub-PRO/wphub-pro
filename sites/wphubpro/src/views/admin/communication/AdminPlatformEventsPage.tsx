import PageMetaData from '@/components/PageMetaData'
import {
  NOTIFICATION_TEMPLATE_EVENT_OPTIONS,
  NOTIFICATION_TEMPLATE_PLACEHOLDER_HINTS,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
  type NotificationTemplateEventKey,
} from '@/domains/notification-templates/events'
import {
  usePlatformEventUpsert,
  usePlatformEventsList,
  type PlatformEventCategory,
  type PlatformEventSeverity,
} from '@/domains/platform-events'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap'

const CATEGORIES: { value: PlatformEventCategory; label: string }[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'site', label: 'Site' },
  { value: 'billing', label: 'Billing' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'account', label: 'Account' },
  { value: 'library', label: 'Library' },
  { value: 'team', label: 'Team' },
  { value: 'subscription', label: 'Subscription' },
]

const SEVERITIES: { value: PlatformEventSeverity; label: string }[] = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'high_risk', label: 'High risk' },
]

const AdminPlatformEventsPage = () => {
  const listQ = usePlatformEventsList()
  const upsert = usePlatformEventUpsert()

  const [editEvent, setEditEvent] = useState<NotificationTemplateEventKey>('plugin_update_available')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<PlatformEventCategory>('platform')
  const [severity, setSeverity] = useState<PlatformEventSeverity>('info')
  const [notificationEnabled, setNotificationEnabled] = useState(true)
  const [notificationTitle, setNotificationTitle] = useState('')
  const [notificationBody, setNotificationBody] = useState('')
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailTemplateKey, setEmailTemplateKey] = useState('')

  const itemsByEvent = useMemo(() => {
    const events = listQ.data?.events ?? []
    const m = new Map<string, (typeof events)[0]>()
    for (const row of events) {
      if (row?.event_key) m.set(String(row.event_key), row)
    }
    return m
  }, [listQ.data])

  useEffect(() => {
    const row = itemsByEvent.get(editEvent)
    if (row) {
      setTitle(String(row.title || editEvent))
      setCategory((row.category as PlatformEventCategory) || 'platform')
      setSeverity((row.severity as PlatformEventSeverity) || 'info')
      setNotificationEnabled(row.notification_enabled !== false)
      setNotificationTitle(String(row.notification_title || ''))
      setNotificationBody(String(row.notification_body || ''))
      setEmailEnabled(row.email_enabled === true)
      setEmailTemplateKey(String(row.email_template_key || editEvent))
    } else {
      const opt = NOTIFICATION_TEMPLATE_EVENT_OPTIONS.find((o) => o.value === editEvent)
      setTitle(opt?.label ?? editEvent)
      setCategory('platform')
      setSeverity('info')
      setNotificationEnabled(true)
      setNotificationTitle(opt?.label ?? editEvent)
      setNotificationBody('')
      setEmailEnabled(false)
      setEmailTemplateKey(editEvent)
    }
  }, [editEvent, itemsByEvent])

  const placeholders = NOTIFICATION_TEMPLATE_PLACEHOLDERS[editEvent] || []
  const placeholderHints = NOTIFICATION_TEMPLATE_PLACEHOLDER_HINTS[editEvent]

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    upsert.mutate({
      event_key: editEvent,
      title: title.trim(),
      category,
      severity,
      notification_enabled: notificationEnabled,
      notification_title: notificationTitle.trim(),
      notification_body: notificationBody,
      email_enabled: emailEnabled,
      email_template_key: emailTemplateKey.trim() || editEvent,
    })
  }

  return (
    <>
      <PageMetaData title="Platform events · Admin" />
      <Row>
        <Col lg={9}>
          <Card>
            <Card.Body>
              <Card.Title as="h5" className="mb-3">
                Platform events
              </Card.Title>
              <p className="text-muted small">
                Automated notifications are sent when code triggers an event key. In-app delivery creates one row per
                recipient; mark read deletes the row.
              </p>
              {listQ.isError ? (
                <Alert variant="danger">Could not load platform events.</Alert>
              ) : null}
              <Form onSubmit={onSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Event key</Form.Label>
                  <Form.Select
                    value={editEvent}
                    onChange={(e) => setEditEvent(e.target.value as NotificationTemplateEventKey)}
                  >
                    {NOTIFICATION_TEMPLATE_EVENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label} ({o.value})
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Admin title</Form.Label>
                  <Form.Control value={title} onChange={(e) => setTitle(e.target.value)} />
                </Form.Group>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Category</Form.Label>
                      <Form.Select value={category} onChange={(e) => setCategory(e.target.value as PlatformEventCategory)}>
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Severity</Form.Label>
                      <Form.Select value={severity} onChange={(e) => setSeverity(e.target.value as PlatformEventSeverity)}>
                        {SEVERITIES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Check
                  type="switch"
                  className="mb-3"
                  label="In-app notification enabled"
                  checked={notificationEnabled}
                  onChange={(e) => setNotificationEnabled(e.target.checked)}
                />
                <Form.Group className="mb-3">
                  <Form.Label>Notification title template</Form.Label>
                  <Form.Control value={notificationTitle} onChange={(e) => setNotificationTitle(e.target.value)} />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Notification body template</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={4}
                    value={notificationBody}
                    onChange={(e) => setNotificationBody(e.target.value)}
                  />
                </Form.Group>
                <Form.Check
                  type="switch"
                  className="mb-3"
                  label="Email enabled"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                />
                <Form.Group className="mb-3">
                  <Form.Label>Email template key</Form.Label>
                  <Form.Control value={emailTemplateKey} onChange={(e) => setEmailTemplateKey(e.target.value)} />
                </Form.Group>
                <Button type="submit" disabled={upsert.isPending}>
                  {upsert.isPending ? <Spinner size="sm" animation="border" /> : 'Save event'}
                </Button>
                {upsert.isSuccess ? (
                  <span className="text-success ms-2 small">Saved.</span>
                ) : null}
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={3}>
          <Card>
            <Card.Body>
              <Card.Title as="h6">Placeholders</Card.Title>
              <ul className="small mb-0">
                {placeholders.map((p) => (
                  <li key={p}>
                    <code>{'{{' + p + '}}'}</code>
                    {placeholderHints?.[p] ? <div className="text-muted">{placeholderHints[p]}</div> : null}
                  </li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  )
}

export default AdminPlatformEventsPage
