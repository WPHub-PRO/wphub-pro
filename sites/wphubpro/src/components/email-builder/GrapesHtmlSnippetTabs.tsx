import { lazy, Suspense, useCallback, useState } from 'react';
import { Form, Nav, Spinner } from 'react-bootstrap';

const GrapesEmailEditor = lazy(() => import('./GrapesEmailEditor'));

export type GrapesHtmlSnippetTabsProps = {
  value: string;
  onChange: (next: string) => void;
  /** Used for Grapes remount when switching back to Visual from Source. */
  fieldKey: string;
  height?: string;
  idPrefix: string;
};

export default function GrapesHtmlSnippetTabs({
  value,
  onChange,
  fieldKey,
  height = '320px',
  idPrefix,
}: GrapesHtmlSnippetTabsProps) {
  const [tab, setTab] = useState<'visual' | 'source'>('visual');
  const [visualMount, setVisualMount] = useState(0);

  const bumpVisual = useCallback(() => {
    setVisualMount((n) => n + 1);
  }, []);

  return (
    <div>
      <Nav variant="tabs" className="mb-2 flex-nowrap" activeKey={tab}>
        <Nav.Item>
          <Nav.Link
            eventKey="visual"
            active={tab === 'visual'}
            id={`${idPrefix}-tab-visual`}
            onClick={() => {
              if (tab !== 'visual') bumpVisual();
              setTab('visual');
            }}>
            Visual
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link
            eventKey="source"
            active={tab === 'source'}
            id={`${idPrefix}-tab-source`}
            onClick={() => setTab('source')}>
            Source
          </Nav.Link>
        </Nav.Item>
      </Nav>
      {tab === 'visual' ? (
        <Suspense
          fallback={
            <div className="d-flex align-items-center gap-2 text-muted py-4 justify-content-center border rounded">
              <Spinner animation="border" size="sm" />
              Loading editor…
            </div>
          }>
          <GrapesEmailEditor
            key={`${fieldKey}-${visualMount}`}
            initialHtml={value}
            onChange={onChange}
            height={height}
          />
        </Suspense>
      ) : (
        <Form.Control
          as="textarea"
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="font-monospace small"
          aria-labelledby={`${idPrefix}-tab-source`}
        />
      )}
    </div>
  );
}
