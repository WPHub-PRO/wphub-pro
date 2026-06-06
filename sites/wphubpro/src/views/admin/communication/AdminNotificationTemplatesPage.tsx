import PageMetaData from '@/components/PageMetaData'
import {
  NOTIFICATION_TEMPLATE_EVENT_OPTIONS,
  NOTIFICATION_TEMPLATE_PLACEHOLDER_HINTS,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
  type NotificationTemplateEventKey,
} from '@/domains/notification-templates/events'
import { useNotificationTemplateUpsert, useNotificationTemplatesList } from '@/domains/notification-templates/hooks'
import { useMemo, useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap'

const AdminNotificationTemplatesPage = () => {
  const listQ = useNotificationTemplatesList()
  const upsert = useNotificationTemplateUpsert()

  const [editEvent, setEditEvent] = useState<NotificationTemplateEventKey>('plugin_update_available')
  const [docId, setDocId] = useState('')
  const [titleTpl, setTitleTpl] = useState('')
  const [bodyTpl, setBodyTpl] = useState('')
  const [enabled, setEnabled] = useState(true)

  const itemsByEvent = useMemo(() => {
    const raw =
      listQ.data && typeof listQ.data === 'object' && 'items' in listQ.data
        ? (listQ.data as { items?: unknown }).items
        : undefined
    const list = Array.isArray(raw) ? raw : []
    const m = new Map<string, (typeof list)[0]>()
    for (const row of list) {
      if (row && typeof row === 'object' && 'event_key' in row && row.event_key) {
        m.set(String(row.event_key), row)
      }
    }
    return m
  }, [listQ.data])

  useEffect(() => {
    const row = itemsByEvent.get(editEvent)
    if (row && typeof row === 'object') {
      const r = row as {
        $id?: string
        title_template?: string
        body_template?: string
        enabled?: boolean
      }
      setDocId(r.$id || '')
      setTitleTpl(String(r.title_template || ''))
      setBodyTpl(String(r.body_template || ''))
      setEnabled(r.enabled !== false)
    } else {
      setDocId('')
      const opt = NOTIFICATION_TEMPLATE_EVENT_OPTIONS.find((o) => o.value === editEvent)
      setTitleTpl(opt?.label ?? editEvent)
      setBodyTpl('')
      setEnabled(true)
    }
  }, [editEvent, itemsByEvent, listQ.data])

  const placeholders = NOTIFICATION_TEMPLATE_PLACEHOLDERS[editEvent] || []
  const placeholderHints = NOTIFICATION_TEMPLATE_PLACEHOLDER_HINTS[editEvent]

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    upsert.mutate({
      documentId: docId || undefined,
      event_key: editEvent,
      title_template: titleTpl.trim(),
      body_template: bodyTpl,
      enabled,
    })
  }

  return (
    <>
      <PageMetaData title="Notification templates · Admin" />
      <Row>
      <Col lg={9}>
        <Card>
          <Card.Body>
            <Card.Title as="h5" className="mb-3">
              Notification templates
            </Card.Title>
            <p className="text-muted small">
              Automated in-app messages use these templates (with <code>{'{{placeholders}}'}</code>). Empty rows fall back to
              built-in defaults until you save.
            </p>
            {editEvent === 'team_invite_existing_user' ? (
              <Alert variant="info" className="py-2 small">
                Team invite notifications can render native <strong>Accept</strong> and <strong>Decline</strong> buttons when
                invite metadata is present. Use <code>{'{{accept_cta}}'}</code> and <code>{'{{decline_cta}}'}</code> to control
                the button labels.
              </Alert>
            ) : null}
            {listQ.isError && (
              <Alert variant="danger" className="py-2 small">
                Failed to load templates.
              </Alert>
            )}
            {upsert.isError && (
              <Alert variant="danger" className="py-2 small">
                {upsert.error instanceof Error ? upsert.error.message : 'Save failed'}
              </Alert>
            )}
            {upsert.isSuccess && (
              <Alert variant="success" className="py-2">
                Saved.
              </Alert>
            )}
            <Form onSubmit={onSubmit}>
              <Form.Group className="mb-3">
                <Form.Label>Event</Form.Label>
                <Form.Select
                  value={editEvent}
                  onChange={(e) => setEditEvent(e.target.value as NotificationTemplateEventKey)}
                >
                  {NOTIFICATION_TEMPLATE_EVENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Title template</Form.Label>
                <Form.Control value={titleTpl} onChange={(e) => setTitleTpl(e.target.value)} maxLength={512} required />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Body template</Form.Label>
                <Form.Control as="textarea" rows={5} value={bodyTpl} onChange={(e) => setBodyTpl(e.target.value)} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  id="tpl-enabled"
                  label="Enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
              </Form.Group>
              <Button type="submit" variant="primary" disabled={upsert.isPending || listQ.isLoading}>
                {upsert.isPending ? (
                  <>
                    <Spinner size="sm" className="me-1" /> Saving…
                  </>
                ) : (
                  'Save template'
                )}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </Col>
      <Col lg={3}>
        <Card className="border-0 bg-light">
          <Card.Body className="small">
            <Card.Title as="h6" className="mb-2">
              Replacement codes for this event
            </Card.Title>
            <ul className="mb-0 ps-3">
              {placeholders.map((code) => (
                <li key={code}>
                  <code>{`{{${code}}}`}</code>
                  {placeholderHints?.[code] ? (
                    <span className="text-muted d-block small">{placeholderHints[code]}</span>
                  ) : null}
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

export default AdminNotificationTemplatesPage
