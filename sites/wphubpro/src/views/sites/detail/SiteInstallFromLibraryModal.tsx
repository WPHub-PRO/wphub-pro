import { ROUTE_PATHS } from '@/config/routePaths';
import type { LibraryDashboardRow } from '@/domains/library';
import { buildCategoryPathById, buildLibraryDashboardRows } from '@/domains/library';
import { useLibraryItems } from '@/hooks/useLibrary';
import { useLibraryCategories } from '@/hooks/useLibraryCategories';
import { filterLibraryRows } from '@/views/library/libraryFilters';
import SiteLibraryInstallOneConfirmModal from '@/views/sites/detail/SiteLibraryInstallOneConfirmModal';
import { useMemo, useState } from 'react';
import { Button, Form, ListGroup, OverlayTrigger, Spinner, Tooltip } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'
import { LuSearch } from 'react-icons/lu';
import { Link } from 'react-router';

type LibraryKind = 'plugin' | 'theme';

type SiteInstallFromLibraryModalProps = {
  show: boolean;
  onHide: () => void;
  siteId: string;
  kind: LibraryKind;
  canInstall: boolean;
  openAddLibraryItem: () => void;
};

function sortRowsForSitePicker(rows: LibraryDashboardRow[]): LibraryDashboardRow[] {
  return [...rows].sort((a, b) => {
    if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

const SiteInstallFromLibraryModal = ({
  show,
  onHide,
  siteId,
  kind,
  canInstall,
  openAddLibraryItem,
}: SiteInstallFromLibraryModalProps) => {
  const [searchQ, setSearchQ] = useState('');
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);

  const { data: libraryItems = [], isLoading, isError, error } = useLibraryItems();
  const { data: categories = [] } = useLibraryCategories();

  const categoryNameById = useMemo(() => buildCategoryPathById(categories), [categories]);
  const libraryRows = useMemo(
    () => buildLibraryDashboardRows(libraryItems, categoryNameById),
    [libraryItems, categoryNameById],
  );

  const view = kind === 'plugin' ? 'plugins' : 'themes';

  const filteredRows = useMemo(() => {
    const base = filterLibraryRows(libraryRows, {
      view,
      tag: null,
      categoryId: null,
      q: searchQ,
      favouritesKind: null,
    });
    return sortRowsForSitePicker(base);
  }, [libraryRows, view, searchQ]);

  const title = kind === 'plugin' ? 'Install plugin from library' : 'Install theme from library';

  const handleExited = () => {
    setSearchQ('');
    setConfirmSlug(null);
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg" scrollable centered onExited={handleExited}>
        <Modal.Header closeButton>
          <Modal.Title className="fs-lg">{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <div className="app-search flex-grow-1" style={{ minWidth: '12rem' }}>
              <Form.Control
                type="search"
                placeholder="Search…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                aria-label="Search library items"
              />
              <LuSearch className="app-search-icon text-muted" />
            </div>
            <Button variant="danger" className="fw-medium flex-shrink-0" type="button" onClick={openAddLibraryItem}>
              Library Item Toevoegen
            </Button>
          </div>

          {!canInstall && (
            <p className="text-muted small mb-3 mb-md-0">
              Connect this site to install from the library via the bridge.
            </p>
          )}

          {isError && (
            <p className="text-danger small">{error instanceof Error ? error.message : 'Could not load library.'}</p>
          )}

          {isLoading && (
            <div className="d-flex justify-content-center py-4">
              <Spinner animation="border" size="sm" variant="primary" />
            </div>
          )}

          {!isLoading && !isError && filteredRows.length === 0 && (
            <p className="text-muted text-center py-4 mb-0">No matching library items.</p>
          )}

          {!isLoading && !isError && filteredRows.length > 0 && (
            <ListGroup variant="flush" className="border rounded">
              {filteredRows.map((row) => {
                const installButton = (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canInstall}
                    onClick={() => setConfirmSlug(row.routeSlug)}
                  >
                    Install
                  </Button>
                );
                return (
                  <ListGroup.Item
                    key={row.id}
                    className="d-flex justify-content-between align-items-start gap-2 flex-wrap py-3"
                  >
                    <div className="min-w-0">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        {row.isFavourite ? (
                          <span className="badge bg-warning bg-opacity-25 text-warning-emphasis small">Favourite</span>
                        ) : null}
                        <Link
                          to={ROUTE_PATHS.libraryItemDetailPath(row.kind, row.routeSlug)}
                          className="fw-semibold text-reset text-decoration-none text-truncate d-inline-block"
                          style={{ maxWidth: '22rem' }}
                          title={row.name}
                          onClick={() => onHide()}
                        >
                          {row.name}
                        </Link>
                      </div>
                      <div className="small text-muted mt-1">
                        {row.versionLabel}
                        {row.author ? ` · ${row.author}` : ''}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {!canInstall ? (
                        <OverlayTrigger
                          placement="left"
                          overlay={<Tooltip id={`tip-install-${row.id}`}>Site must be connected</Tooltip>}
                        >
                          <span className="d-inline-block">{installButton}</span>
                        </OverlayTrigger>
                      ) : (
                        installButton
                      )}
                    </div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          )}
        </Modal.Body>
      </Modal>

      <SiteLibraryInstallOneConfirmModal
        show={confirmSlug != null}
        onHide={() => setConfirmSlug(null)}
        siteId={siteId}
        itemKind={kind}
        routeSlug={confirmSlug ?? ''}
        libraryItems={libraryItems}
      />
    </>
  );
};

export default SiteInstallFromLibraryModal;
