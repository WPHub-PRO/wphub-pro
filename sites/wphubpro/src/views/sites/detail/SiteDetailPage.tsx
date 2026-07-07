import { DocHelpButton } from '@/components/docs/DocHelpButton';
import PageBreadcrumb from '@/components/PageBreadcrumb.tsx';
import { ContactSupportButton } from '@/components/support/ContactSupportButton';
import { TabNavLabel } from '@/components/TabNavLabel';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import { useSite, useRequestSiteHealthRefresh, useSitesStatusPoll } from '@/domains/sites';
import {
  runPluginsBulkForSite,
  runThemesBulkForSite,
  toBulkPluginItemForUpdate,
  toBulkThemeItemForUpdate,
} from '@/domains/sites/extensionBulkFromSite';
import { parsePluginsMeta, parseThemesMeta } from '@/domains/sites/installedMeta';
import {
  pluginHasAvailableUpdate,
  resolvePluginAvailableUpdateVersion,
  resolveThemeAvailableUpdateVersion,
  themeHasAvailableUpdate,
} from '@/domains/sites/installedLibraryUpdate';
import { useLibraryItems } from '@/hooks/useLibrary';
import type { DocsHelpContextKey } from '@/domains/docs/docsHelpMap'
import type { LibraryItem, Site, WordPressPlugin, WordPressTheme } from '@/types';
import { useLibraryAddItemFlow } from '@/views/library/hooks/useLibraryAddItemFlow';
import ViewModeToggle, { type LibraryViewMode } from '@/views/library/components/ViewModeToggle';
import SiteDetailSidebarCard from '@/views/sites/detail/SiteDetailSidebarCard';
import SiteOverviewSitespeedCard from '@/views/sites/detail/SiteOverviewSitespeedCard';
import SiteInstalledExtensionGrid from '@/views/sites/detail/SiteInstalledExtensionGrid';
import SiteInstallFromLibraryModal from '@/views/sites/detail/SiteInstallFromLibraryModal';
import { SiteInstalledPluginsTable, SiteInstalledThemesTable } from '@/views/sites/detail/SiteInstalledExtensionsTable';
import { SiteDetailHealthPanel, SiteDetailLogsPanel } from '@/views/sites/detail/SiteDetailSharedPanels';
import { SiteHealthTabStatusBadge } from '@/views/sites/detail/SiteHealthTabStatusBadge';
import { SITE_DETAIL_TAB_CONFIG } from '@/views/sites/detail/siteDetailNavTabs';
import { updateAllExtensionsToast } from '@/views/sites/detail/siteExtensionToastFeedback';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbProgressBolt, TbStethoscope } from 'react-icons/tb';
import { Button, Card, CardBody, Col, Container, Nav, Row, Spinner, Tab, Table } from 'react-bootstrap';
import { Link, useParams, useSearchParams } from 'react-router';

const TAB_KEYS = ['overview', 'plugins', 'themes', 'health', 'logs'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function indexFromTabKey(k: string | null): number {
  if (!k) return 0;
  const idx = TAB_KEYS.indexOf(k as TabKey);
  return idx >= 0 ? idx : 0;
}

function siteDetailHelpContext(tabIndex: number): DocsHelpContextKey {
  const key = TAB_KEYS[tabIndex] ?? 'overview';
  if (key === 'overview') return 'sites:detail:overview';
  if (key === 'plugins') return 'sites:detail:plugins';
  if (key === 'themes') return 'sites:detail:themes';
  if (key === 'health') return 'sites:detail:health';
  return 'sites:detail:logs';
}

function SiteDetailOverview({
  siteId,
  site,
  libraryItems,
  pluginsWithUpdates,
  themesWithUpdates,
  pluginTotal,
  themeTotal,
  onGoHealth,
}: {
  siteId: string;
  site: Site;
  libraryItems: LibraryItem[];
  pluginsWithUpdates: WordPressPlugin[];
  themesWithUpdates: WordPressTheme[];
  pluginTotal: number;
  themeTotal: number;
  onGoHealth: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const healthOk = site.healthStatus === 'healthy';
  const nPlugins = pluginsWithUpdates.length;
  const nThemes = themesWithUpdates.length;
  const [updatesTab, setUpdatesTab] = useState<'plugins' | 'themes'>('plugins');
  const [updatesBusy, setUpdatesBusy] = useState(false);

  const activeUpdateCount = updatesTab === 'plugins' ? nPlugins : nThemes;

  const onUpdateAll = useCallback(async () => {
    if (!siteId || updatesBusy || activeUpdateCount === 0) return;
    setUpdatesBusy(true);
    try {
      const res =
        updatesTab === 'plugins'
          ? await runPluginsBulkForSite(
              siteId,
              'update',
              pluginsWithUpdates.map((p) => toBulkPluginItemForUpdate(p, libraryItems)),
            )
          : await runThemesBulkForSite(
              siteId,
              'update',
              themesWithUpdates.map((t) => toBulkThemeItemForUpdate(t, libraryItems)),
            );
      const partial = res.results.length > 0 && res.results.some((r) => !r.ok);
      const kind = updatesTab === 'plugins' ? 'plugin' : 'theme';
      const count = updatesTab === 'plugins' ? pluginsWithUpdates.length : themesWithUpdates.length;
      if (res.ok) {
        const toast = updateAllExtensionsToast(kind, count, true, partial, res.message);
        showNotification({ ...toast, variant: partial ? 'warning' : 'success' });
        void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
        if (user?.$id) {
          void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
          void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
        }
      } else {
        const toast = updateAllExtensionsToast(kind, count, false, false, res.message);
        showNotification({ ...toast, variant: 'danger' });
      }
    } finally {
      setUpdatesBusy(false);
    }
  }, [
    activeUpdateCount,
    pluginsWithUpdates,
    queryClient,
    showNotification,
    siteId,
    themesWithUpdates,
    updatesBusy,
    updatesTab,
    libraryItems,
    user?.$id,
  ]);

  return (
    <>
      <Row className="g-3 align-items-stretch">
        <Col xs={12} md={6} className="d-flex flex-column gap-3 min-h-0 h-100">
          <Card className="flex-grow-1 w-100 border shadow-none d-flex flex-column min-h-0">
            <CardBody className="d-flex flex-column h-100 min-w-0">
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <p className="text-muted fs-xs text-uppercase fw-semibold mb-0">Updates needed</p>
                  <p className="text-muted fs-xxs mb-0">
                    Plugins and themes with an available update from the last sync
                  </p>
                </div>
                {activeUpdateCount > 0 && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="d-inline-flex align-items-center gap-1 flex-shrink-0"
                    disabled={!siteId || updatesBusy}
                    aria-busy={updatesBusy}
                    onClick={() => void onUpdateAll()}
                  >
                    {updatesBusy ? (
                      <span className="fs-sm">…</span>
                    ) : (
                      <>
                        <TbProgressBolt className="fs-lg" aria-hidden />
                        Update all
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex-grow-1 d-flex flex-column min-h-0">
                <Card className="border-0 shadow-none mb-0 flex-grow-1 d-flex flex-column min-h-0 bg-transparent">
                  <CardBody className="p-0 d-flex flex-column flex-grow-1 min-h-0 rounded">
                    <Tab.Container
                      activeKey={updatesTab}
                      onSelect={(k) => {
                        if (k === 'plugins' || k === 'themes') setUpdatesTab(k);
                      }}
                      id={`site-updates-tabs-${site.$id}`}
                    >
                      <div className="px-3 pt-3">
                        <Nav variant="underline" className="fs-xs gap-3 flex-nowrap" role="tablist">
                          <Nav.Item>
                            <Nav.Link eventKey="plugins" className="py-2 px-0">
                              <TabNavLabel Icon={SITE_DETAIL_TAB_CONFIG.plugins.Icon}>
                                Plugins ({nPlugins})
                              </TabNavLabel>
                            </Nav.Link>
                          </Nav.Item>
                          <Nav.Item>
                            <Nav.Link eventKey="themes" className="py-2 px-0">
                              <TabNavLabel Icon={SITE_DETAIL_TAB_CONFIG.themes.Icon}>
                                Themes ({nThemes})
                              </TabNavLabel>
                            </Nav.Link>
                          </Nav.Item>
                        </Nav>
                      </div>
                      <Tab.Content className="flex-grow-1">
                        <Tab.Pane eventKey="plugins" className="p-3">
                          {nPlugins === 0 ? (
                            <p className="text-muted fs-xs mb-0">
                              {pluginTotal === 0 ? 'No plugin data synced yet.' : 'All reported plugins are up to date.'}
                            </p>
                          ) : (
                            <div className="table-responsive border rounded" style={{ maxHeight: '14rem' }}>
                              <Table size="sm" className="mb-0 align-middle">
                                <thead className="table-light position-sticky top-0">
                                  <tr className="fs-xxs text-uppercase">
                                    <th>Name</th>
                                    <th>Installed</th>
                                    <th>Update</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pluginsWithUpdates.map((p) => (
                                    <tr key={p.plugin}>
                                      <td className="text-truncate" style={{ maxWidth: '8rem' }} title={p.name}>
                                        {p.name || p.plugin}
                                      </td>
                                      <td className="text-muted fs-xs text-nowrap">{p.version || '—'}</td>
                                      <td className="fs-xs">
                                        <span className="badge badge-soft-warning fs-xxs">
                                          {resolvePluginAvailableUpdateVersion(p, libraryItems)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </div>
                          )}
                        </Tab.Pane>
                        <Tab.Pane eventKey="themes" className="p-3">
                          {nThemes === 0 ? (
                            <p className="text-muted fs-xs mb-0">
                              {themeTotal === 0 ? 'No theme data synced yet.' : 'All reported themes are up to date.'}
                            </p>
                          ) : (
                            <div className="table-responsive border rounded" style={{ maxHeight: '14rem' }}>
                              <Table size="sm" className="mb-0 align-middle">
                                <thead className="table-light position-sticky top-0">
                                  <tr className="fs-xxs text-uppercase">
                                    <th>Name</th>
                                    <th>Installed</th>
                                    <th>Update</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {themesWithUpdates.map((t) => (
                                    <tr key={t.stylesheet}>
                                      <td className="text-truncate" style={{ maxWidth: '8rem' }} title={t.name}>
                                        {t.name || t.stylesheet}
                                      </td>
                                      <td className="text-muted fs-xs text-nowrap">{t.version || '—'}</td>
                                      <td className="fs-xs">
                                        <span className="badge badge-soft-warning fs-xxs">
                                          {resolveThemeAvailableUpdateVersion(t, libraryItems)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </div>
                          )}
                        </Tab.Pane>
                      </Tab.Content>
                    </Tab.Container>
          </CardBody>
        </Card>
              </div>
              <p className="text-muted fs-xs mb-0 mt-3 pt-3 border-top border-light">
                From last bridge sync · {pluginTotal} plugins, {themeTotal} themes reported
              </p>
          </CardBody>
        </Card>
          <Card className="border shadow-none d-flex flex-column flex-shrink-0">
            <CardBody className="d-flex flex-column flex-grow-1">
            <p className="text-muted fs-xs text-uppercase fw-semibold mb-1">Health</p>
            <p className="mb-2">{healthOk ? 'Status: Healthy' : 'Status: Needs attention'}</p>
            <Button variant="link" className="align-self-start p-0 mt-auto" onClick={onGoHealth}>
              View health details →
            </Button>
          </CardBody>
        </Card>
      </Col>
        <Col xs={12} md={6} className="d-flex min-h-0">
          <SiteOverviewSitespeedCard
            siteId={site.$id}
            siteUrl={site.siteUrl}
            performanceMeta={site.performanceMeta}
          />
      </Col>
    </Row>
    </>
  );
}

const SiteDetailPage = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIndex = indexFromTabKey(searchParams.get('tab'));
  const [tab, setTab] = useState(tabIndex);
  const [pluginsViewMode, setPluginsViewMode] = useState<LibraryViewMode>('table');
  const [themesViewMode, setThemesViewMode] = useState<LibraryViewMode>('table');
  const [installLibraryOpen, setInstallLibraryOpen] = useState(false);
  const [installLibraryKind, setInstallLibraryKind] = useState<'plugin' | 'theme'>('plugin');

  useEffect(() => {
    setTab(indexFromTabKey(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    if (!installLibraryOpen) return;
    if (tab === 1) {
      setInstallLibraryKind('plugin');
      return;
    }
    if (tab === 2) {
      setInstallLibraryKind('theme');
      return;
    }
    setInstallLibraryOpen(false);
  }, [tab, installLibraryOpen]);

  const { openAddLibraryItem, addLibraryModals } = useLibraryAddItemFlow(
    installLibraryOpen ? installLibraryKind === 'plugin' : true,
  );

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

  const { data: site, isLoading, isError, error } = useSite(siteId);
  const enabled = site?.enabled !== false;
  const { showNotification } = useNotificationContext();
  const refreshHealthFromBridge = useRequestSiteHealthRefresh();
  const canPushHealthFromNav =
    Boolean(site?.siteUrl?.trim()) && site?.enabled !== false && !refreshHealthFromBridge.isPending;

  useSitesStatusPoll(siteId && enabled ? [siteId] : []);

  const { data: libraryItems = [] } = useLibraryItems();
  const plugins = useMemo(() => parsePluginsMeta(site?.pluginsMeta), [site?.pluginsMeta]);
  const themes = useMemo(() => parseThemesMeta(site?.themesMeta), [site?.themesMeta]);

  const pluginsWithUpdates = useMemo(
    () => plugins.filter((p) => pluginHasAvailableUpdate(p, libraryItems)),
    [plugins, libraryItems],
  );
  const themesWithUpdates = useMemo(
    () => themes.filter((t) => themeHasAvailableUpdate(t, libraryItems)),
    [themes, libraryItems],
  );

  const pluginRows = useMemo(() => plugins.map((item) => ({ kind: 'plugin' as const, item })), [plugins]);
  const themeRows = useMemo(() => themes.map((item) => ({ kind: 'theme' as const, item })), [themes]);

  if (isLoading) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Site" subtitle="Sites" titleEnd={<DocHelpButton contextKey="sites" />} />
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" role="status" variant="primary">
            <span className="visually-hidden">Loading…</span>
          </Spinner>
        </div>
      </Container>
    );
  }

  if (isError || !site) {
    return (
      <Container fluid>
        <PageBreadcrumb title="Site" subtitle="Sites" titleEnd={<DocHelpButton contextKey="sites" />} />
        <Card className="mt-3">
          <CardBody className="text-center py-5">
            <p className="text-danger mb-2">{error?.message ?? 'Site not found.'}</p>
            <Link to="/sites" className="btn btn-primary btn-sm">
              Back to sites
            </Link>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const title = site.siteName?.trim() || 'Site';
  const canInstallFromLibrary = site.status === 'connected' && enabled;

  return (
    <Container fluid>
      <PageBreadcrumb
        title={title}
        subtitle="Sites"
        titleEnd={<DocHelpButton contextKey={siteDetailHelpContext(tab)} />}
      />

      <Row className="justify-content-center">
        <Col xxl={12}>
          <Row>
            <Col xl={9}>
              <Card className="mb-3 shadow-sm">
                <CardBody className="pb-0 border-bottom border-light">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0">
                    <Nav variant="underline" className="gap-3 flex-nowrap mb-0 flex-grow-1 min-w-0">
                      {TAB_KEYS.map((key, i) => {
                        const { label, Icon } = SITE_DETAIL_TAB_CONFIG[key];
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
                              <span className="d-inline-flex align-items-center gap-2">
                                <TabNavLabel Icon={Icon}>{label}</TabNavLabel>
                                {key === 'health' ? <SiteHealthTabStatusBadge healthMeta={site.healthMeta} /> : null}
                              </span>
                            </Nav.Link>
                          </Nav.Item>
                        );
                      })}
                    </Nav>
                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                    <ContactSupportButton
                      category="site_manager"
                      context={{
                        siteId: site.$id,
                        siteName: site.siteName ?? undefined,
                        sourceLabel: `Site: ${site.siteName?.trim() || site.$id}`,
                      }}
                    />
                    <Button
                      type="button"
                      variant="light"
                      size="sm"
                      className="d-inline-flex align-items-center justify-content-center flex-shrink-0 rounded-circle p-2 border"
                      disabled={!canPushHealthFromNav}
                      title="Ask the bridge on WordPress to send updated Site Health data"
                      aria-label="Refresh Site Health from WordPress"
                      aria-busy={refreshHealthFromBridge.isPending}
                      onClick={() => {
                        refreshHealthFromBridge.mutate(site.$id, {
                          onSuccess: (res) => {
                            showNotification({
                              title: 'Site Health',
                              message: res.message,
                              variant: 'success',
                            });
                          },
                          onError: (err) => {
                            showNotification({
                              title: 'Site Health',
                              message: err instanceof Error ? err.message : 'Request failed.',
                              variant: 'danger',
                            });
                          },
                        });
                      }}
                    >
                      <TbStethoscope className="fs-lg" aria-hidden />
                    </Button>
                    </div>
                  </div>
                </CardBody>
                <CardBody className="pt-4 pb-4">
              {tab === 0 && (
                <SiteDetailOverview
                  siteId={site.$id}
                  site={site}
                  libraryItems={libraryItems}
                  pluginsWithUpdates={pluginsWithUpdates}
                  themesWithUpdates={themesWithUpdates}
                  pluginTotal={plugins.length}
                  themeTotal={themes.length}
                  onGoHealth={() => setTabKey('health')}
                />
              )}
              {tab === 1 && (
                    <div>
                      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="fw-medium"
                          onClick={() => {
                            setInstallLibraryKind('plugin');
                            setInstallLibraryOpen(true);
                          }}
                        >
                          Install
                        </Button>
                        <ViewModeToggle
                          value={pluginsViewMode}
                          onChange={setPluginsViewMode}
                          idPrefix="site-plugins"
                        />
                      </div>
                      {pluginsViewMode === 'table' ? (
                        <SiteInstalledPluginsTable
                          siteId={site.$id}
                          plugins={plugins}
                          emptyMessage="No plugins in the last sync. Connect the site and wait for metadata, or open the bridge on the site."
                        />
                      ) : (
                <SiteInstalledExtensionGrid
                  siteId={site.$id}
                  rows={pluginRows}
                  emptyMessage="No plugins in the last sync. Connect the site and wait for metadata, or open the bridge on the site."
                />
                      )}
                    </div>
              )}
              {tab === 2 && (
                    <div>
                      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          className="fw-medium"
                          onClick={() => {
                            setInstallLibraryKind('theme');
                            setInstallLibraryOpen(true);
                          }}
                        >
                          Install
                        </Button>
                        <ViewModeToggle
                          value={themesViewMode}
                          onChange={setThemesViewMode}
                          idPrefix="site-themes"
                        />
                      </div>
                      {themesViewMode === 'table' ? (
                        <SiteInstalledThemesTable
                          siteId={site.$id}
                          themes={themes}
                          emptyMessage="No themes in the last sync. Connect the site and wait for metadata, or open the bridge on the site."
                        />
                      ) : (
                <SiteInstalledExtensionGrid
                  siteId={site.$id}
                  rows={themeRows}
                  emptyMessage="No themes in the last sync. Connect the site and wait for metadata, or open the bridge on the site."
                />
                      )}
                    </div>
              )}
              {tab === 3 && <SiteDetailHealthPanel site={site} />}
              {tab === 4 && <SiteDetailLogsPanel site={site} />}
                </CardBody>
              </Card>
            </Col>

            <Col xl={3}>
              <SiteDetailSidebarCard site={site} onViewFullLogs={() => setTabKey('logs')} />
            </Col>
          </Row>
        </Col>
      </Row>

      <SiteInstallFromLibraryModal
        show={installLibraryOpen}
        onHide={() => setInstallLibraryOpen(false)}
        siteId={site.$id}
        kind={installLibraryKind}
        canInstall={canInstallFromLibrary}
        openAddLibraryItem={openAddLibraryItem}
      />
      {addLibraryModals}
    </Container>
  );
};

export default SiteDetailPage;
