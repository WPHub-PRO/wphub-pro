import { DocHelpButton } from '@/components/docs/DocHelpButton';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { TabNavLabel } from '@/components/TabNavLabel';
import { ROUTE_PATHS } from '@/config/routePaths';
import { familyHasInstallBlockers, familyMemberStats, resolveFamilyMembers } from '@/domains/library';
import { useSites } from '@/domains/sites';
import { useLibraryItems } from '@/hooks/useLibrary';
import { useLibraryCategories } from '@/hooks/useLibraryCategories';
import {
  useDeleteLibraryFamily,
  useLibraryFamilies,
  useUpdateLibraryFamilyName,
} from '@/hooks/useLibraryFamiliesAndCollections';
import LibraryFamilyDetailMembers from '@/views/library/detail/LibraryFamilyDetailMembers';
import LibraryFamilyDetailSites from '@/views/library/detail/LibraryFamilyDetailSites';
import { LIBRARY_FAMILY_DETAIL_TAB_CONFIG } from '@/views/library/detail/libraryFamilyDetailNavTabs';
import LibraryFamilyEditMembersModal from '@/views/library/modals/LibraryFamilyEditMembersModal';
import LibraryFamilyInstallModal from '@/views/library/modals/LibraryFamilyInstallModal';
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

const LibraryFamilyDetailPage = () => {
  const { familyId } = useParams<{ familyId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIndex = indexFromTabKey(searchParams.get('tab'));
  const [tab, setTab] = useState(tabIndex);

  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [editMembersOpen, setEditMembersOpen] = useState(false);
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

  const { data: families = [], isLoading: familiesLoading } = useLibraryFamilies();
  const { data: libraryItems = [], isLoading: itemsLoading } = useLibraryItems();
  const { data: sites = [] } = useSites();
  const { data: categories = [] } = useLibraryCategories();

  const updateName = useUpdateLibraryFamilyName();
  const deleteFamily = useDeleteLibraryFamily();

  const family = useMemo(
    () => (familyId ? families.find((f) => f.$id === familyId) ?? null : null),
    [families, familyId],
  );

  useEffect(() => {
    if (!family || searchParams.get('edit') !== 'members') return;
    setEditMembersOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      },
      { replace: true },
    );
  }, [family, searchParams, setSearchParams]);

  const members = useMemo(
    () => (family ? resolveFamilyMembers(family, libraryItems) : []),
    [family, libraryItems],
  );

  const stats = useMemo(() => familyMemberStats(members), [members]);
  const hasBlockers = useMemo(() => familyHasInstallBlockers(members), [members]);

  const displayTitle = family?.name?.trim() || family?.memberSlugs.join(', ') || 'Family';

  useEffect(() => {
    if (family && !nameEditing) {
      setDraftName(family.name?.trim() ?? '');
    }
  }, [family, nameEditing]);

  const handleSaveName = () => {
    if (!family) return;
    updateName.mutate(
      { familyId: family.$id, name: draftName },
      { onSuccess: () => setNameEditing(false) },
    );
  };

  const handleDelete = () => {
    if (!family) return;
    const ok = window.confirm(`Delete family "${displayTitle}"? This cannot be undone.`);
    if (!ok) return;
    deleteFamily.mutate(
      { familyId: family.$id },
      { onSuccess: () => navigate(`${ROUTE_PATHS.LIBRARY}?view=families`) },
    );
  };

  const busy = updateName.isPending || deleteFamily.isPending;
  const loading = familiesLoading || itemsLoading;

  if (!familyId) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Family" subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />
        <Card className="mt-3">
          <CardBody className="text-center py-5">
            <p className="text-danger mb-2">Invalid family link.</p>
            <Link to={`${ROUTE_PATHS.LIBRARY}?view=families`} className="btn btn-primary btn-sm">
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
        <PageBreadcrumb title="Family" subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" role="status" variant="primary">
            <span className="visually-hidden">Loading…</span>
          </Spinner>
        </div>
      </Container>
    );
  }

  if (!family) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Family" subtitle="Library" titleEnd={<DocHelpButton contextKey="library" />} />
        <Card className="mt-3">
          <CardBody className="text-center py-5">
            <p className="text-danger mb-2">This family was not found in your workspace.</p>
            <Link to={`${ROUTE_PATHS.LIBRARY}?view=families`} className="btn btn-primary btn-sm">
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
        <Link to={`${ROUTE_PATHS.LIBRARY}?view=families`} className="btn btn-link p-0 text-decoration-none">
          ← Back to families
        </Link>
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={hasBlockers || stats.total === 0}
            onClick={() => setInstallOpen(true)}
          >
            Install family
          </Button>
          <Button variant="outline-primary" size="sm" onClick={() => setEditMembersOpen(true)}>
            Edit members
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
                        placeholder="Family name"
                        style={{ maxWidth: '20rem' }}
                        aria-label="Family name"
                      />
                      <Button variant="primary" size="sm" disabled={busy} onClick={handleSaveName}>
                        Save
                      </Button>
                      <Button
                        variant="light"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setDraftName(family.name?.trim() ?? '');
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
                    Group related plugins and themes for linked installs. Members are matched by slug.
                  </p>
                  <p className="text-muted fs-xs mb-0">
                    {stats.total} member{stats.total === 1 ? '' : 's'} · {stats.inLibrary} in library
                    {stats.missing > 0 ? ` · ${stats.missing} missing` : ''}
                    {stats.ambiguous > 0 ? ` · ${stats.ambiguous} ambiguous` : ''}
                  </p>
                </div>
                <Button
                  variant="outline-danger"
                  size="sm"
                  className="d-inline-flex align-items-center justify-content-center flex-shrink-0 rounded-circle p-2"
                  style={{ width: '2.25rem', height: '2.25rem' }}
                  disabled={deleteFamily.isPending}
                  onClick={handleDelete}
                  aria-label="Delete family"
                  title="Delete family"
                >
                  <TbTrash className="fs-lg" />
                </Button>
              </div>
            </CardBody>

            <CardBody className="pb-0 border-bottom border-light">
              <Nav variant="underline" className="gap-3 flex-nowrap mb-0">
                {TAB_KEYS.map((key, i) => {
                  const { label, Icon } = LIBRARY_FAMILY_DETAIL_TAB_CONFIG[key];
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
                  Some members are missing from the library or match both a plugin and a theme. Fix members before
                  installing this family.
                </Alert>
              ) : null}

              {tab === 0 && (
                <div>
                  <h6 className="text-muted text-uppercase fs-xs fw-semibold mb-2">Members</h6>
                  <p className="text-muted fs-sm mb-3">
                    Choose the install version per member. Order is used when you install the full family on sites.
                  </p>
                  <LibraryFamilyDetailMembers family={family} members={members} busy={busy} />
                </div>
              )}

              {tab === 1 && (
                <div>
                  <p className="text-muted fs-sm mb-3">
                    Connected sites in this workspace where all family members appear in the last bridge sync.
                  </p>
                  <LibraryFamilyDetailSites sites={sites} members={members} />
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <LibraryFamilyEditMembersModal
        show={editMembersOpen}
        onHide={() => setEditMembersOpen(false)}
        family={family}
        libraryItems={libraryItems}
        categories={categories}
      />

      <LibraryFamilyInstallModal
        show={installOpen}
        onHide={() => setInstallOpen(false)}
        family={family}
        libraryItems={libraryItems}
        sites={sites}
      />
    </Container>
  );
};

export default LibraryFamilyDetailPage;
