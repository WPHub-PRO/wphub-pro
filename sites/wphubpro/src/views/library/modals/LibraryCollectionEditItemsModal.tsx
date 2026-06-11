import { buildLibraryDashboardRows } from '@/domains/library';
import { useUpdateLibraryCollectionItems } from '@/hooks/useLibraryFamiliesAndCollections';
import type { LibraryCategory, LibraryCollection, LibraryCollectionMember, LibraryItem } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap';
import { LuSearch } from 'react-icons/lu';
import { TbArrowDown, TbArrowUp, TbX } from 'react-icons/tb';

type LibraryCollectionEditItemsModalProps = {
  show: boolean;
  onHide: () => void;
  collection: LibraryCollection;
  libraryItems: LibraryItem[];
  categories: LibraryCategory[];
};

function itemKey(m: LibraryCollectionMember): string {
  return `${m.slug}:${m.type}`;
}

const LibraryCollectionEditItemsModal = ({
  show,
  onHide,
  collection,
  libraryItems,
  categories,
}: LibraryCollectionEditItemsModalProps) => {
  const updateItems = useUpdateLibraryCollectionItems();
  const [draftItems, setDraftItems] = useState<LibraryCollectionMember[]>([]);
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    if (show) {
      setDraftItems([...collection.items]);
      setSearchQ('');
    }
  }, [show, collection.items]);

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.$id] = c.name;
    return map;
  }, [categories]);

  const libraryRows = useMemo(
    () => buildLibraryDashboardRows(libraryItems, categoryNameById),
    [libraryItems, categoryNameById],
  );

  const existingKeys = useMemo(() => new Set(draftItems.map(itemKey)), [draftItems]);

  const pickerRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    let rows = libraryRows.filter((r) => !existingKeys.has(`${r.routeSlug}:${r.kind}`));
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.routeSlug.includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return rows.slice(0, 40);
  }, [libraryRows, existingKeys, searchQ]);

  const addItem = (slug: string, type: 'plugin' | 'theme') => {
    const s = slug.trim().toLowerCase();
    const key = `${s}:${type}`;
    if (!s || existingKeys.has(key)) return;
    setDraftItems((prev) => [...prev, { slug: s, type, versionMode: 'default' }]);
  };

  const removeItem = (key: string) => {
    setDraftItems((prev) => prev.filter((m) => itemKey(m) !== key));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= draftItems.length) return;
    setDraftItems((prev) => {
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  const handleSave = () => {
    updateItems.mutate(
      { collectionId: collection.$id, items: draftItems },
      { onSuccess: () => onHide() },
    );
  };

  const busy = updateItems.isPending;

  return (
    <Modal show={show} onHide={onHide} centered scrollable size="lg" onExited={() => setSearchQ('')}>
      <Modal.Header closeButton>
        <Modal.Title className="fs-lg">Edit collection items</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Order matters for batch installs. Each item includes plugin or theme type explicitly.
        </p>

        {draftItems.length === 0 ? (
          <Alert variant="light" className="small py-2 mb-3">
            No items yet. Add from your library search below.
          </Alert>
        ) : (
          <ListGroup className="mb-3">
            {draftItems.map((item, index) => (
              <ListGroup.Item
                key={itemKey(item)}
                className="d-flex flex-wrap align-items-center justify-content-between gap-2"
              >
                <span className="fw-medium">
                  {item.slug} <span className="text-muted fs-xs">({item.type})</span>
                </span>
                <div className="d-flex align-items-center gap-1">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="p-1"
                    disabled={busy || index === 0}
                    onClick={() => moveItem(index, -1)}
                    aria-label="Move up"
                  >
                    <TbArrowUp />
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="p-1"
                    disabled={busy || index === draftItems.length - 1}
                    onClick={() => moveItem(index, 1)}
                    aria-label="Move down"
                  >
                    <TbArrowDown />
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="p-1"
                    disabled={busy}
                    onClick={() => removeItem(itemKey(item))}
                    aria-label="Remove"
                  >
                    <TbX />
                  </Button>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}

        <Form.Label className="small fw-semibold">Add from library</Form.Label>
        <div className="app-search mb-2">
          <Form.Control
            type="search"
            placeholder="Search plugins and themes…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            aria-label="Search library"
          />
          <LuSearch className="app-search-icon text-muted" />
        </div>
        {pickerRows.length > 0 ? (
          <ListGroup style={{ maxHeight: '14rem', overflowY: 'auto' }}>
            {pickerRows.map((row) => (
              <ListGroup.Item
                key={row.id}
                className="d-flex flex-wrap align-items-center justify-content-between gap-2 py-2"
              >
                <div>
                  <span className="fw-medium">{row.name}</span>
                  <span className="text-muted fs-xs ms-2">
                    {row.routeSlug} · {row.kind}
                  </span>
                </div>
                <Button
                  variant="outline-primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => addItem(row.routeSlug, row.kind)}
                >
                  Add
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        ) : (
          <p className="text-muted fs-xs mb-0">No matching library items or all are already in this collection.</p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={busy}>
          Save items
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default LibraryCollectionEditItemsModal;
