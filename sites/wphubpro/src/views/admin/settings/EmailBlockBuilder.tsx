import type { EmailBlock, EmailBlocksDoc } from '@/domains/system-email/emailBlocks';
import { newBlockId } from '@/domains/system-email/emailBlocks';
import { useState } from 'react';
import { Button, Card, Col, Form, InputGroup, Row } from 'react-bootstrap';

export type EmailBlockBuilderProps = {
  value: EmailBlocksDoc;
  onChange: (doc: EmailBlocksDoc) => void;
};

function updateBlock(doc: EmailBlocksDoc, id: string, patch: Partial<EmailBlock>): EmailBlocksDoc {
  return {
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)),
  };
}

function removeBlock(doc: EmailBlocksDoc, id: string): EmailBlocksDoc {
  return { ...doc, blocks: doc.blocks.filter((b) => b.id !== id) };
}

function moveBlock(doc: EmailBlocksDoc, id: string, dir: -1 | 1): EmailBlocksDoc {
  const i = doc.blocks.findIndex((b) => b.id === id);
  if (i < 0) return doc;
  const j = i + dir;
  if (j < 0 || j >= doc.blocks.length) return doc;
  const next = [...doc.blocks];
  const tmp = next[i];
  next[i] = next[j]!;
  next[j] = tmp!;
  return { ...doc, blocks: next };
}

function appendBlock(doc: EmailBlocksDoc, kind: EmailBlock['type']): EmailBlocksDoc {
  const id = newBlockId();
  let block: EmailBlock;
  switch (kind) {
    case 'heading':
      block = { id, type: 'heading', level: 2, text: '' };
      break;
    case 'paragraph':
      block = { id, type: 'paragraph', text: '' };
      break;
    case 'button_row':
      block = {
        id,
        type: 'button_row',
        primaryLabel: 'Accept',
        primaryHref: '{{invite_accept_url}}',
        secondaryLabel: 'Decline',
        secondaryHref: '{{invite_decline_url}}',
      };
      break;
    case 'hint':
      block = { id, type: 'hint', text: '' };
      break;
    case 'spacer':
      block = { id, type: 'spacer', px: 16 };
      break;
    case 'html':
      block = { id, type: 'html', content: '' };
      break;
    default:
      block = { id, type: 'paragraph', text: '' };
  }
  return { ...doc, blocks: [...doc.blocks, block] };
}

function BlockEditor({
  doc,
  block,
  onChange,
}: {
  doc: EmailBlocksDoc;
  block: EmailBlock;
  onChange: (doc: EmailBlocksDoc) => void;
}) {
  const patch = (p: Partial<EmailBlock>) => onChange(updateBlock(doc, block.id, p));

  switch (block.type) {
    case 'heading':
      return (
        <>
          <Form.Group className="mb-2">
            <Form.Label className="small text-muted mb-1">Level</Form.Label>
            <Form.Select
              size="sm"
              value={block.level}
              onChange={(e) => patch({ level: Number(e.target.value) === 3 ? 3 : 2 })}>
              <option value={2}>Heading 2</option>
              <option value={3}>Heading 3</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-0">
            <Form.Label className="small text-muted mb-1">Text</Form.Label>
            <Form.Control
              size="sm"
              value={block.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder="You can use {{shortcodes}}"
            />
          </Form.Group>
        </>
      );
    case 'paragraph':
      return (
        <Form.Group className="mb-0">
          <Form.Label className="small text-muted mb-1">Paragraph</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            size="sm"
            value={block.text}
            onChange={(e) => patch({ text: e.target.value })}
            placeholder="Plain text; {{team_name}}, {{platform_title}}, …"
          />
        </Form.Group>
      );
    case 'button_row':
      return (
        <div className="small">
          <p className="text-muted mb-2">Two buttons (optional second). Use shortcodes for URLs.</p>
          <Row className="g-2 mb-2">
            <Col md={6}>
              <Form.Label className="small text-muted">Primary label</Form.Label>
              <Form.Control
                size="sm"
                value={block.primaryLabel}
                onChange={(e) => patch({ primaryLabel: e.target.value })}
              />
            </Col>
            <Col md={6}>
              <Form.Label className="small text-muted">Primary URL</Form.Label>
              <Form.Control
                size="sm"
                className="font-monospace"
                value={block.primaryHref}
                onChange={(e) => patch({ primaryHref: e.target.value })}
                placeholder="{{invite_accept_url}}"
              />
            </Col>
          </Row>
          <Row className="g-2">
            <Col md={6}>
              <Form.Label className="small text-muted">Secondary label (optional)</Form.Label>
              <Form.Control
                size="sm"
                value={block.secondaryLabel}
                onChange={(e) => patch({ secondaryLabel: e.target.value })}
              />
            </Col>
            <Col md={6}>
              <Form.Label className="small text-muted">Secondary URL</Form.Label>
              <Form.Control
                size="sm"
                className="font-monospace"
                value={block.secondaryHref}
                onChange={(e) => patch({ secondaryHref: e.target.value })}
                placeholder="{{invite_decline_url}}"
              />
            </Col>
          </Row>
        </div>
      );
    case 'hint':
      return (
        <Form.Group className="mb-0">
          <Form.Label className="small text-muted mb-1">Small print / fallback link line</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            size="sm"
            value={block.text}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </Form.Group>
      );
    case 'spacer':
      return (
        <Form.Group className="mb-0">
          <Form.Label className="small text-muted mb-1">Height (px)</Form.Label>
          <Form.Control
            type="number"
            size="sm"
            min={4}
            max={64}
            value={block.px}
            onChange={(e) => patch({ px: Number(e.target.value) || 16 })}
          />
        </Form.Group>
      );
    case 'html':
      return (
        <Form.Group className="mb-0">
          <Form.Label className="small text-muted mb-1">Raw HTML (advanced)</Form.Label>
          <Form.Control
            as="textarea"
            rows={6}
            size="sm"
            className="font-monospace"
            value={block.content}
            onChange={(e) => patch({ content: e.target.value })}
            spellCheck={false}
          />
        </Form.Group>
      );
    default:
      return null;
  }
}

export default function EmailBlockBuilder({ value, onChange }: EmailBlockBuilderProps) {
  const doc = value;
  const [addKey, setAddKey] = useState(0);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span className="small text-muted">Add block:</span>
        <InputGroup size="sm" style={{ maxWidth: 280 }}>
          <Form.Select
            key={addKey}
            aria-label="Add email block"
            defaultValue=""
            onChange={(e) => {
              const t = e.target.value as EmailBlock['type'] | '';
              if (!t) return;
              onChange(appendBlock(doc, t));
              setAddKey((k) => k + 1);
            }}>
            <option value="">Choose…</option>
            <option value="heading">Heading</option>
            <option value="paragraph">Paragraph</option>
            <option value="button_row">Button row</option>
            <option value="hint">Hint / small text</option>
            <option value="spacer">Spacer</option>
            <option value="html">Raw HTML</option>
          </Form.Select>
        </InputGroup>
      </div>

      {doc.blocks.length === 0 && (
        <p className="text-muted small">No blocks yet — add one above.</p>
      )}

      <div className="d-flex flex-column gap-3">
        {doc.blocks.map((block, idx) => (
          <Card key={block.id} className="border shadow-sm">
            <Card.Body className="py-3 px-3">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                <span className="small fw-semibold text-uppercase text-muted">
                  {block.type.replace('_', ' ')}
                </span>
                <div className="d-flex gap-1">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    type="button"
                    disabled={idx === 0}
                    onClick={() => onChange(moveBlock(doc, block.id, -1))}>
                    Up
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    type="button"
                    disabled={idx >= doc.blocks.length - 1}
                    onClick={() => onChange(moveBlock(doc, block.id, 1))}>
                    Down
                  </Button>
                  <Button variant="outline-danger" size="sm" type="button" onClick={() => onChange(removeBlock(doc, block.id))}>
                    Remove
                  </Button>
                </div>
              </div>
              <BlockEditor doc={doc} block={block} onChange={onChange} />
            </Card.Body>
          </Card>
        ))}
      </div>
    </div>
  );
}
