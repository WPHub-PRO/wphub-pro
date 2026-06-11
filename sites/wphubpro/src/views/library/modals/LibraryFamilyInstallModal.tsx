import { ROUTE_PATHS } from '@/config/routePaths';
import {
  buildInstallVersionOptions,
  pickLibraryItemForMember,
  resolveFamilyMembers,
  runFamilyInstallOnSites,
  validateFamilyForInstall,
  type FamilyInstallWpInfoMap,
} from '@/domains/library';
import { useAuth } from '@/domains/auth';
import { useNotificationContext } from '@/context/useNotificationContext';
import { getWpPluginInfo, getWpThemeInfo } from '@/services/wordpress';
import type { LibraryFamily, LibraryItem, Site } from '@/types';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner, Table } from 'react-bootstrap';
import { Link } from 'react-router';

type LibraryFamilyInstallModalProps = {
  show: boolean;
  onHide: () => void;
  family: LibraryFamily;
  libraryItems: LibraryItem[];
  sites: Site[];
};

const LibraryFamilyInstallModal = ({
  show,
  onHide,
  family,
  libraryItems,
  sites,
}: LibraryFamilyInstallModalProps) => {
  const [installSiteIds, setInstallSiteIds] = useState<Set<string>>(() => new Set());
  const [installRunning, setInstallRunning] = useState(false);

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  const connectedSites = useMemo(
    () => sites.filter((s) => s.status === 'connected' && s.enabled !== false),
    [sites],
  );

  const validation = useMemo(
    () => validateFamilyForInstall(family, libraryItems),
    [family, libraryItems],
  );

  const members = useMemo(
    () => (validation.ok ? validation.members : resolveFamilyMembers(family, libraryItems)),
    [validation, family, libraryItems],
  );

  const pluginSlugs = useMemo(
    () => members.filter((m) => m.kind === 'plugin').map((m) => m.slug),
    [members],
  );
  const themeSlugs = useMemo(
    () => members.filter((m) => m.kind === 'theme').map((m) => m.slug),
    [members],
  );

  const wpPluginQueries = useQueries({
    queries: pluginSlugs.map((slug) => ({
      queryKey: ['wpPluginInfo', slug],
      queryFn: () => getWpPluginInfo(slug),
      enabled: show,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const wpThemeQueries = useQueries({
    queries: themeSlugs.map((slug) => ({
      queryKey: ['wpThemeInfo', slug],
      queryFn: () => getWpThemeInfo(slug),
      enabled: show,
      staleTime: 1000 * 60 * 10,
    })),
  });

  const wpInfo: FamilyInstallWpInfoMap = useMemo(() => {
    const plugins: FamilyInstallWpInfoMap['plugins'] = {};
    const themes: FamilyInstallWpInfoMap['themes'] = {};
    pluginSlugs.forEach((slug, i) => {
      plugins[slug] = wpPluginQueries[i]?.data;
    });
    themeSlugs.forEach((slug, i) => {
      themes[slug] = wpThemeQueries[i]?.data;
    });
    return { plugins, themes };
  }, [pluginSlugs, themeSlugs, wpPluginQueries, wpThemeQueries]);

  const wpLoading =
    wpPluginQueries.some((q) => q.isLoading) || wpThemeQueries.some((q) => q.isLoading);

  const memberSummary = useMemo(() => {
    return members.map((member) => {
      if (member.kind !== 'plugin' && member.kind !== 'theme') {
        return { slug: member.slug, label: member.displayName, versionLabel: '—', blocked: true };
      }
      const item = pickLibraryItemForMember(member.items, family.memberPreferences?.[member.slug]);
      const options = buildInstallVersionOptions(
        member.items,
        member.itemKind,
        wpInfo.plugins[member.slug],
        wpInfo.themes[member.slug],
      );
      const opt = options.find((o) => o.key === item?.$id);
      return {
        slug: member.slug,
        label: member.displayName,
        versionLabel: opt?.label ?? item?.version ?? '—',
        blocked: false,
      };
    });
  }, [members, family.memberPreferences, wpInfo]);

  const allSitesSelected =
    connectedSites.length > 0 && installSiteIds.size === connectedSites.length;

  const toggleSite = (siteId: string) => {
    setInstallSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const handleClose = () => {
    if (installRunning) return;
    onHide();
    setInstallSiteIds(new Set());
  };

  const runInstall = async () => {
    if (!validation.ok) return;
    if (installSiteIds.size === 0) return;

    setInstallRunning(true);
    const siteList = [...installSiteIds];
    try {
      const results = await runFamilyInstallOnSites(family, libraryItems, siteList, wpInfo);
      const okCount = results.filter((r) => r.ok).length;
      const lines = results.map((r) => {
        const site = connectedSites.find((s) => s.$id === r.siteId);
        const label = site?.siteName?.trim() || r.siteId;
        return `${label} · ${r.memberSlug}: ${r.ok ? 'installed' : r.message}`;
      });

      if (okCount === results.length) {
        showNotification({
          title: 'Family installed',
          message: lines.join('\n'),
          variant: 'success',
        });
      } else if (okCount > 0) {
        showNotification({
          title: 'Family install finished with errors',
          message: lines.join('\n'),
          variant: 'warning',
        });
      } else {
        showNotification({
          title: 'Family install failed',
          message: lines.join('\n'),
          variant: 'danger',
        });
      }

      if (okCount > 0 && user?.$id) {
        void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
        for (const sid of siteList) {
          void queryClient.invalidateQueries({ queryKey: ['site', sid] });
        }
      }
    } finally {
      setInstallRunning(false);
      handleClose();
    }
  };

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      scrollable
      size="lg"
      backdrop={installRunning ? 'static' : true}
      keyboard={!installRunning}
    >
      <Modal.Header closeButton>
        <Modal.Title className="fs-lg">Install family on site(s)</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Members are installed in order on each selected site through the WPHub Pro bridge.
        </p>

        {!validation.ok ? (
          <Alert variant="warning" className="small py-2 mb-3">
            {validation.message}
          </Alert>
        ) : null}

        <h6 className="fs-sm fw-semibold mb-2">Members (install order)</h6>
        <ul className="list-unstyled small mb-3">
          {memberSummary.map((m, i) => (
            <li key={m.slug} className="py-1 border-bottom border-light">
              <span className="text-muted me-2">{i + 1}.</span>
              <span className="fw-medium">{m.label}</span>
              <span className="text-muted ms-2">{m.versionLabel}</span>
            </li>
          ))}
        </ul>

        {wpLoading ? (
          <Alert variant="light" className="small py-2 mb-3">
            Loading WordPress.org version information…
          </Alert>
        ) : null}

        {connectedSites.length === 0 ? (
          <p className="text-muted small mb-0">
            No connected sites.{' '}
            <Link to={ROUTE_PATHS.SITES} onClick={handleClose}>
              Go to Sites
            </Link>{' '}
            to add one.
          </p>
        ) : (
          <>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <Button
                variant="outline-secondary"
                size="sm"
                type="button"
                onClick={() => setInstallSiteIds(new Set(connectedSites.map((s) => s.$id)))}
              >
                Select all
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                type="button"
                onClick={() => setInstallSiteIds(new Set())}
              >
                Clear
              </Button>
              <span className="text-muted small ms-auto">
                {installSiteIds.size} of {connectedSites.length} selected
              </span>
            </div>
            <div className="border rounded overflow-hidden" style={{ maxHeight: 'min(22rem, 55vh)' }}>
              <Table responsive hover size="sm" className="mb-0 align-middle">
                <thead className="table-light position-sticky top-0">
                  <tr>
                    <th style={{ width: '2.5rem' }} className="text-center">
                      <Form.Check
                        type="checkbox"
                        aria-label="Select all sites"
                        checked={allSitesSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setInstallSiteIds(new Set(connectedSites.map((s) => s.$id)));
                          } else {
                            setInstallSiteIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th>Site</th>
                  </tr>
                </thead>
                <tbody>
                  {connectedSites.map((site) => (
                    <tr key={site.$id}>
                      <td className="text-center">
                        <Form.Check
                          type="checkbox"
                          checked={installSiteIds.has(site.$id)}
                          onChange={() => toggleSite(site.$id)}
                          aria-label={`Select ${site.siteName || site.$id}`}
                        />
                      </td>
                      <td>{site.siteName?.trim() || site.$id}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={handleClose} disabled={installRunning}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={
            installRunning ||
            !validation.ok ||
            installSiteIds.size === 0 ||
            wpLoading ||
            connectedSites.length === 0
          }
          onClick={() => void runInstall()}
        >
          {installRunning ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Installing…
            </>
          ) : (
            'Install on selected sites'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default LibraryFamilyInstallModal;
