import { DocHelpButton } from '@/components/docs/DocHelpButton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { TabNavLabel } from '@/components/TabNavLabel';
import { ROUTE_PATHS } from '@/config/routePaths';
import {
  collectionHasInstallBlockers,
  collectionMemberStats,
  resolveCollectionMembers,
} from '@/domains/library';
import { useSitesForLibraryInstall } from '@/domains/sites';
import { useLibraryItems } from '@/hooks/useLibrary';
import { useLibraryCategories } from '@/hooks/useLibraryCategories';
import {
  useDeleteLibraryCollection,
  useLibraryCollections,
  useUpdateLibraryCollectionName,
} from '@/hooks/useLibraryFamiliesAndCollections';
import LibraryCollectionDetailItems from '@/views/library/detail/LibraryCollectionDetailItems';
import LibraryCollectionDetailSites from '@/views/library/detail/LibraryCollectionDetailSites';
import { LIBRARY_COLLECTION_DETAIL_TAB_CONFIG } from '@/views/library/detail/libraryCollectionDetailNavTabs';
import LibraryCollectionEditItemsModal from '@/views/library/modals/LibraryCollectionEditItemsModal';
import LibraryCollectionInstallModal from '@/views/library/modals/LibraryCollectionInstallModal';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Col,
  Container,
  Form,
  Nav,
  Row,
  Spinner,
} from 'react-bootstrap';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { TbPencil, TbTrash } from 'react-icons/tb';

const TAB_KEYS = ['overview', 'sites'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function indexFromTabKey(k: string | null): number {
  if (!k) return 0;
  const idx = TAB_KEYS.indexOf(k as TabKey);
  return idx >= 0 ? idx : 0;
}

const LibraryCollectionDetailPage = () => {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIndex = indexFromTabKey(searchParams.get('tab'));
  const [tab, setTab] = useState(tabIndex);

  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editItemsOpen, setEditItemsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    setTab(indexFromTabKey(searchParams.get('tab')));
  }, [searchParams]);

  const setTabKey = (key: TabKey) => {
    const i = TAB_KEYS.indexOf(key);
    setTab(i);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', key);
        return next;
      },
      { replace: true },
    );
  };

  const { data: collections = [], isLoading: collectionsLoading } = useLibraryCollections();
  const { data: libraryItems = [], isLoading: itemsLoading } = useLibraryItems();
  const { data: sites = [] } = useSitesForLibraryInstall();
  const { data: categories = [] } = useLibraryCategories();

  const updateName = useUpdateLibraryCollectionName();
  const deleteCollection = useDeleteLibraryCollection();

  const collection = useMemo(
    () => (collectionId ? collections.find((c) => c.$id === collectionId) ?? null : null),
    [collections, collectionId],
  );

  const members = useMemo(
    () => (collection ? resolveCollectionMembers(collection, libraryItems) : []),
    [collection, libraryItems],
  );

  const stats = useMemo(() => collectionMemberStats(members), [members]);
  const hasBlockers = useMemo(() => collectionHasInstallBlockers(members), [members]);

  const displayTitle = collection?.name?.trim() || 'Collection';

  useEffect(() => {
    if (collection && !nameEditing) {
      setDraftName(collection.name.trim());
    }
  }, [collection, nameEditing]);

  const handleSaveName = () => {
    if (!collection) return;
    updateName.mutate(
      { collectionId: collection.$id, name: draftName },
      { onSuccess: () => setNameEditing(false) },
    );
  };

  const handleDelete = () => {
    if (!collection) return;
    const ok = window.confirm(`Delete collection "${displayTitle}"? This cannot be undone.`);
    if (!ok) return;
    deleteCollection.mutate(
      { collectionId: collection.$id },
      { onSuccess: () => navigate(`${ROUTE_PATHS.LIBRARY}?view=collections`) },
    );
  };

  const busy = updateName.isPending || deleteCollection.isPending;
  const loading = collectionsLoading || itemsLoading;

  if (!collectionId) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Collection" subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />
        <Card className="mt-3">
          <CardBody className="text-center py-5">
            <p className="text-danger mb-2">Invalid collection link.</p>
            <Link to={`${ROUTE_PATHS.LIBRARY}?view=collections`} className="btn btn-primary btn-sm">
              Back to library
            </Link>
          </CardBody>
        </Card>
      </Container>
    );
  }

  if (loading) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Collection" subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" role="status" variant="primary">
            <span className="visually-hidden">Loading…</span>
          </Spinner>
        </div>
      </Container>
    );
  }

  if (!collection) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Collection" subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />
        <Card className="mt-3">
          <CardBody className="text-center py-5">
            <p className="text-danger mb-2">This collection was not found in your workspace.</p>
            <Link to={`${ROUTE_PATHS.LIBRARY}?view=collections`} className="btn btn-primary btn-sm">
              Back to library
            </Link>
          </CardBody>
        </Card>
      </Container>
    );
  }

  return (
    <Container fluid>
      <PageBreadcrumb title={displayTitle} subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />

      <div className="mb-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <Link to={`${ROUTE_PATHS.LIBRARY}?view=collections`} className="btn btn-link p-0 text-decoration-none">
          ← Back to collections
        </Link>
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={hasBlockers || stats.total === 0}
            onClick={() => setInstallOpen(true)}
          >
            Install collection
          </Button>
          <Button variant="outline-primary" size="sm" onClick={() => setEditItemsOpen(true)}>
            Edit items
          </Button>
        </div>
      </div>

      <Row className="justify-content-center">
        <Col xxl={12}>
          <Card className="mb-3 shadow-sm">
            <CardBody className="pb-3 border-bottom border-light">
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
                <div className="flex-grow-1 min-w-0">
                  {nameEditing ? (
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <Form.Control
                        size="sm"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        placeholder="Collection name"
                        style={{ maxWidth: '20rem' }}
                        aria-label="Collection name"
                      />
                      <Button variant="primary" size="sm" disabled={busy} onClick={handleSaveName}>
                        Save
                      </Button>
                      <Button
                        variant="light"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setDraftName(collection.name.trim());
                          setNameEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="d-flex flex-wrap align-items-center gap-2">
                      <h4 className="mb-0">{displayTitle}</h4>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        className="d-inline-flex align-items-center justify-content-center rounded-circle p-0"
                        style={{ width: '2rem', height: '2rem' }}
                        onClick={() => setNameEditing(true)}
                        aria-label="Edit name"
                        title="Edit name"
                      >
                        <TbPencil className="fs-5" />
                      </Button>
                    </div>
                  )}
                  <p className="text-muted fs-sm mb-2 mt-2">
                    Curated bundle of plugins and themes for batch install on sites.
                  </p>
                  <p className="text-muted fs-xs mb-0">
                    {stats.total} item{stats.total === 1 ? '' : 's'} · {stats.inLibrary} in library
                    {stats.missing > 0 ? ` · ${stats.missing} missing` : ''}
                  </p>
                </div>
                <Button
                  variant="outline-danger"
                  size="sm"
                  className="d-inline-flex align-items-center justify-content-center flex-shrink-0 rounded-circle p-2"
                  style={{ width: '2.25rem', height: '2.25rem' }}
                  disabled={deleteCollection.isPending}
                  onClick={handleDelete}
                  aria-label="Delete collection"
                  title="Delete collection"
                >
                  <TbTrash className="fs-lg" />
                </Button>
              </div>
            </CardBody>

            <CardBody className="pb-0 border-bottom border-light">
              <Nav variant="underline" className="gap-3 flex-nowrap mb-0">
                {TAB_KEYS.map((key, i) => {
                  const { label, Icon } = LIBRARY_COLLECTION_DETAIL_TAB_CONFIG[key];
                  return (
                    <Nav.Item key={key}>
                      <Nav.Link
                        active={tab === i}
                        href="#"
                        className="py-2 px-0"
                        onClick={(e) => {
                          e.preventDefault();
                          setTabKey(key);
                        }}
                      >
                        <TabNavLabel Icon={Icon}>{label}</TabNavLabel>
                      </Nav.Link>
                    </Nav.Item>
                  );
                })}
              </Nav>
            </CardBody>

            <CardBody className="pt-4 pb-4">
              {hasBlockers ? (
                <Alert variant="warning" className="small py-2 mb-3">
                  Some items are missing from the library. Add them or remove from the collection before installing.
                </Alert>
              ) : null}

              {tab === 0 && (
                <div>
                  <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">Items</h6>
                  <p className="text-muted fs-sm mb-3">
                    Set default or manual install version per item. Order is used when you install the full collection.
                  </p>
                  <LibraryCollectionDetailItems
                    collection={collection}
                    members={members}
                    busy={busy}
                  />
                </div>
              )}

              {tab === 1 && (
                <div>
                  <p className="text-muted fs-sm mb-3">
                    Connected sites where collection items appear in the last bridge sync.
                  </p>
                  <LibraryCollectionDetailSites sites={sites} members={members} />
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <LibraryCollectionEditItemsModal
        show={editItemsOpen}
        onHide={() => setEditItemsOpen(false)}
        collection={collection}
        libraryItems={libraryItems}
        categories={categories}
      />

      <LibraryCollectionInstallModal
        show={installOpen}
        onHide={() => setInstallOpen(false)}
        collection={collection}
        libraryItems={libraryItems}
        sites={sites}
      />
    </Container>
  );
};

export default LibraryCollectionDetailPage;
