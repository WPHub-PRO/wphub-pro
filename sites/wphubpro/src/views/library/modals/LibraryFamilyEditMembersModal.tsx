import { buildLibraryDashboardRows } from '@/domains/library';
import { useUpdateLibraryFamilyMemberSlugs } from '@/hooks/useLibraryFamiliesAndCollections';
import type { LibraryCategory, LibraryFamily, LibraryItem } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap';
import { LuSearch } from 'react-icons/lu';
import { TbArrowDown, TbArrowUp, TbX } from 'react-icons/tb';

type LibraryFamilyEditMembersModalProps = {
  show: boolean;
  onHide: () => void;
  family: LibraryFamily;
  libraryItems: LibraryItem[];
  categories: LibraryCategory[];
};

const LibraryFamilyEditMembersModal = ({
  show,
  onHide,
  family,
  libraryItems,
  categories,
}: LibraryFamilyEditMembersModalProps) => {
  const updateSlugs = useUpdateLibraryFamilyMemberSlugs();
  const [draftSlugs, setDraftSlugs] = useState<string[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [manualSlug, setManualSlug] = useState('');

  useEffect(() => {
    if (show) {
      setDraftSlugs([...family.memberSlugs]);
      setSearchQ('');
      setManualSlug('');
    }
  }, [show, family.memberSlugs]);

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.$id] = c.name;
    return map;
  }, [categories]);

  const libraryRows = useMemo(
    () => buildLibraryDashboardRows(libraryItems, categoryNameById),
    [libraryItems, categoryNameById],
  );

  const pickerRows = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    const existing = new Set(draftSlugs.map((s) => s.toLowerCase()));
    let rows = libraryRows.filter((r) => !existing.has(r.routeSlug));
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.routeSlug.includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return rows.slice(0, 40);
  }, [libraryRows, draftSlugs, searchQ]);

  const addSlug = (slug: string) => {
    const s = slug.trim().toLowerCase();
    if (!s) return;
    if (draftSlugs.some((x) => x.toLowerCase() === s)) return;
    setDraftSlugs((prev) => [...prev, s]);
    setManualSlug('');
  };

  const removeSlug = (slug: string) => {
    setDraftSlugs((prev) => prev.filter((s) => s.toLowerCase() !== slug.toLowerCase()));
  };

  const moveSlug = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= draftSlugs.length) return;
    setDraftSlugs((prev) => {
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  const handleSave = () => {
    updateSlugs.mutate(
      { familyId: family.$id, memberSlugs: draftSlugs },
      { onSuccess: () => onHide() },
    );
  };

  const busy = updateSlugs.isPending;

  return (
    <Modal show={show} onHide={onHide} centered scrollable size="lg" onExited={() => setSearchQ('')}>
      <Modal.Header closeButton>
        <Modal.Title className="fs-lg">Edit family members</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Order matters for family installs (e.g. free plugin before pro add-on).
        </p>

        {draftSlugs.length === 0 ? (
          <Alert variant="light" className="small py-2 mb-3">
            No members yet. Add from your library or enter a slug manually.
          </Alert>
        ) : (
          <ListGroup className="mb-3">
            {draftSlugs.map((slug, index) => (
              <ListGroup.Item
                key={slug}
                className="d-flex flex-wrap align-items-center justify-content-between gap-2"
              >
                <span className="fw-medium">{slug}</span>
                <div className="d-flex align-items-center gap-1">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="p-1"
                    disabled={busy || index === 0}
                    onClick={() => moveSlug(index, -1)}
                    aria-label="Move up"
                  >
                    <TbArrowUp />
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="p-1"
                    disabled={busy || index === draftSlugs.length - 1}
                    onClick={() => moveSlug(index, 1)}
                    aria-label="Move down"
                  >
                    <TbArrowDown />
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="p-1"
                    disabled={busy}
                    onClick={() => removeSlug(slug)}
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
          <ListGroup className="mb-3" style={{ maxHeight: '14rem', overflowY: 'auto' }}>
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
                <Button variant="outline-primary" size="sm" disabled={busy} onClick={() => addSlug(row.routeSlug)}>
                  Add
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        ) : (
          <p className="text-muted fs-xs mb-3">No matching library items or all are already members.</p>
        )}

        <Form.Label className="small fw-semibold">Add slug manually</Form.Label>
        <div className="d-flex gap-2">
          <Form.Control
            size="sm"
            value={manualSlug}
            onChange={(e) => setManualSlug(e.target.value)}
            placeholder="e.g. woocommerce-subscriptions"
            aria-label="Manual slug"
          />
          <Button
            variant="outline-primary"
            size="sm"
            disabled={busy || !manualSlug.trim()}
            onClick={() => addSlug(manualSlug)}
          >
            Add
          </Button>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={busy}>
          Save members
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default LibraryFamilyEditMembersModal;
