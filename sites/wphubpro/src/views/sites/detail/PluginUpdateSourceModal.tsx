import {
  findLibraryItemsForInstalledPlugin,
  getInstalledPluginWpSlug,
} from '@/domains/sites/installedPluginLibraryMatch';
import type { SitePluginUpdateChoice } from '@/domains/sites/pluginUpdateFromSite';
import { getWpPluginInfo } from '@/services/wordpress';
import type { LibraryItem, WordPressPlugin } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'

/** Library local/remote plugin rows use wp-proxy zip resolution (see `pluginUpdateFromSite`). */

type PluginUpdateSourceModalProps = {
  show: boolean;
  onHide: () => void;
  plugin: WordPressPlugin;
  allLibraryItems: LibraryItem[] | undefined;
  onConfirm: (choice: SitePluginUpdateChoice) => void;
  isSubmitting: boolean;
};

type RadioId =
  | { t: 'org' }
  | { t: 'lib'; id: string };

/**
 * If the user has library rows for this plugin slug, pick where the update should come from.
 * WordPress.org uses bridge `install-version` when the plugin is in the directory.
 * Library official, uploaded (local), and remote HTTPS ZIP rows can be selected when present.
 */
const PluginUpdateSourceModal = ({
  show,
  onHide,
  plugin,
  allLibraryItems,
  onConfirm,
  isSubmitting,
}: PluginUpdateSourceModalProps) => {
  const forSlug = useMemo(
    () => findLibraryItemsForInstalledPlugin(allLibraryItems ?? [], plugin),
    [allLibraryItems, plugin],
  );
  const slug = useMemo(() => getInstalledPluginWpSlug(plugin), [plugin]);
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
      const info = await getWpPluginInfo(slug);
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

  if (!show) {
    return null;
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Update “{plugin.name}”</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">Choose where the Hub should download the update package from.</p>
        <Form>
          <Form.Group className="mb-2">
            <Form.Check
              type="radio"
              id="upd-src-org"
              name="upd-src"
              checked={selected?.t === 'org'}
              onChange={() => setSelected({ t: 'org' })}
              label="WordPress.org (latest in directory)"
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
                    id={`upd-src-lib-${it.$id}`}
                    name="upd-src"
                    checked={selected?.t === 'lib' && selected.id === it.$id}
                    onChange={() => setSelected({ t: 'lib', id: it.$id })}
                    label={
                      <span>
                        {it.name}
                        {it.isDefault && (
                          <span className="text-muted"> · default</span>
                        )}
                        <span className="text-muted"> · {it.version}</span>
                      </span>
                    }
                    disabled={isSubmitting}
                  />
                  <div className="small text-muted ps-4">
                    Uses the library row’s pinned version if it still exists on WordPress.org, otherwise
                    the latest in the directory.
                  </div>
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
                    id={`upd-src-lib-${it.$id}`}
                    name="upd-src"
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
                  <div className="small text-muted ps-4">
                    {it.source === 'local'
                      ? 'Uses your uploaded build from library storage (HTTPS zip on the site).'
                      : 'Uses the HTTPS ZIP URL stored on this library row.'}
                  </div>
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
          disabled={
            isSubmitting ||
            !selected ||
            (selected.t === 'org' && (orgLoading || !!orgError))
          }
        >
          {isSubmitting ? 'Updating…' : 'Update'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PluginUpdateSourceModal;
