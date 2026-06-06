import {
  findLibraryItemsForInstalledTheme,
  getInstalledThemeWpSlug,
} from '@/domains/sites/installedThemeLibraryMatch';
import type { SiteThemeUpdateChoice } from '@/domains/sites/themeUpdateFromSite';
import { getWpThemeInfo } from '@/services/wordpress';
import type { LibraryItem, WordPressTheme } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';

type ThemeUpdateSourceModalProps = {
  show: boolean;
  onHide: () => void;
  theme: WordPressTheme;
  allLibraryItems: LibraryItem[] | undefined;
  onConfirm: (choice: SiteThemeUpdateChoice) => void;
  isSubmitting: boolean;
};

type RadioId = { t: 'org' } | { t: 'lib'; id: string };

const ThemeUpdateSourceModal = ({
  show,
  onHide,
  theme,
  allLibraryItems,
  onConfirm,
  isSubmitting,
}: ThemeUpdateSourceModalProps) => {
  const forSlug = useMemo(
    () => findLibraryItemsForInstalledTheme(allLibraryItems ?? [], theme),
    [allLibraryItems, theme],
  );
  const slug = useMemo(() => getInstalledThemeWpSlug(theme), [theme]);
  const [orgLabel, setOrgLabel] = useState<string>('');
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RadioId | null>(null);

  const officialRows = forSlug.filter((i) => i.source === 'official');
  const nonOfficial = forSlug.filter((i) => i.source === 'local' || i.source === 'remote');

  useEffect(() => {
    if (!show || !slug) return;
    let c = true;
    setOrgLoading(true);
    setOrgError(null);
    void (async () => {
      const info = await getWpThemeInfo(slug);
      if (!c) return;
      setOrgLoading(false);
      if (info?.version) {
        setOrgLabel(String(info.version));
      } else {
        setOrgError('Could not load the latest version from WordPress.org.');
        setOrgLabel('');
      }
    })();
    return () => {
      c = false;
    };
  }, [show, slug]);

  useEffect(() => {
    if (!show) {
      setSelected(null);
      return;
    }
    if (!slug) {
      setSelected({ t: 'org' });
      return;
    }
    const def = forSlug.find((i) => i.isDefault);
    if (def && def.source === 'official') {
      setSelected({ t: 'lib', id: def.$id });
    } else {
      setSelected({ t: 'org' });
    }
  }, [show, slug, forSlug]);

  if (!show) return null;

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Update “{theme.name}”</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">Choose where the Hub should download the update package from.</p>
        <Form>
          <Form.Group className="mb-2">
            <Form.Check
              type="radio"
              id="theme-upd-src-org"
              name="theme-upd-src"
              checked={selected?.t === 'org'}
              onChange={() => setSelected({ t: 'org' })}
              label="WordPress.org (directory update)"
              disabled={isSubmitting}
            />
            <div className="small text-muted ps-4 pb-1">
              {orgLoading && (
                <span>
                  <Spinner size="sm" className="me-1" /> Resolving version…
                </span>
              )}
              {!orgLoading && !orgError && orgLabel && <>Latest: {orgLabel}</>}
              {orgError && <span className="text-warning">{orgError}</span>}
            </div>
          </Form.Group>

          {officialRows.length > 0 && (
            <>
              <p className="text-muted small mb-1 mt-3">WPHub Library (official build)</p>
              {officialRows.map((it) => (
                <Form.Group className="mb-2" key={it.$id}>
                  <Form.Check
                    type="radio"
                    id={`theme-upd-src-lib-${it.$id}`}
                    name="theme-upd-src"
                    checked={selected?.t === 'lib' && selected.id === it.$id}
                    onChange={() => setSelected({ t: 'lib', id: it.$id })}
                    label={
                      <span>
                        {it.name}
                        {it.isDefault && <span className="text-muted"> · default</span>}
                        <span className="text-muted"> · {it.version}</span>
                      </span>
                    }
                    disabled={isSubmitting}
                  />
                </Form.Group>
              ))}
            </>
          )}

          {nonOfficial.length > 0 && (
            <>
              <p className="text-muted small mb-1 mt-3">WPHub Library (uploaded or remote ZIP)</p>
              {nonOfficial.map((it) => (
                <Form.Group className="mb-2" key={it.$id}>
                  <Form.Check
                    type="radio"
                    id={`theme-upd-src-lib-${it.$id}`}
                    name="theme-upd-src"
                    checked={selected?.t === 'lib' && selected.id === it.$id}
                    onChange={() => setSelected({ t: 'lib', id: it.$id })}
                    label={
                      <span>
                        {it.name}
                        {it.isDefault && <span className="text-muted"> · default</span>}
                        <span className="text-muted">
                          {' '}
                          · {it.source} · {it.version}
                        </span>
                      </span>
                    }
                    disabled={isSubmitting}
                  />
                </Form.Group>
              ))}
            </>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="soft-secondary" onClick={onHide} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!selected) return;
            if (selected.t === 'org') onConfirm({ kind: 'wordpress_org' });
            else {
              const row = forSlug.find((r) => r.$id === selected.id);
              if (row) onConfirm({ kind: 'library', item: row });
            }
          }}
          disabled={isSubmitting || !selected || (selected.t === 'org' && (orgLoading || !!orgError))}
        >
          {isSubmitting ? 'Updating…' : 'Update'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ThemeUpdateSourceModal;
