import { ROUTE_PATHS } from '@/config/routePaths';
import {
  filterLibraryItemsBySlugAndType,
  planLibraryBridgeInstall,
  runLibraryBridgeInstallOnSite,
} from '@/domains/library';
import { useAuth } from '@/domains/auth';
import { useNotificationContext } from '@/context/useNotificationContext';
import { getWpPluginInfo, getWpThemeInfo } from '@/services/wordpress';
import type { LibraryItem, LibraryItemSource } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import Modal from '@/components/ui/AppModal'

function sourceLabel(source: LibraryItemSource): string {
  if (source === 'official') return 'WordPress.org';
  if (source === 'local') return 'Uploaded';
  return 'Remote URL';
}

type SiteLibraryInstallOneConfirmModalProps = {
  show: boolean;
  onHide: () => void;
  siteId: string;
  itemKind: 'plugin' | 'theme';
  routeSlug: string;
  libraryItems: LibraryItem[];
};

const SiteLibraryInstallOneConfirmModal = ({
  show,
  onHide,
  siteId,
  itemKind,
  routeSlug,
  libraryItems,
}: SiteLibraryInstallOneConfirmModalProps) => {
  const slug = routeSlug.trim().toLowerCase();
  const [installVersionItemId, setInstallVersionItemId] = useState('');
  const [installBridgeRunning, setInstallBridgeRunning] = useState(false);

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  const groupItems = useMemo(
    () => (slug ? filterLibraryItemsBySlugAndType(libraryItems, slug, itemKind) : []),
    [libraryItems, slug, itemKind],
  );

  useEffect(() => {
    if (!show) {
      setInstallVersionItemId('');
      return;
    }
    if (groupItems.length === 0) return;
    setInstallVersionItemId((prev) => {
      if (prev && groupItems.some((i) => i.$id === prev)) return prev;
      const def = groupItems.find((i) => i.isDefault === true) ?? groupItems[0];
      return def?.$id ?? '';
    });
  }, [show, groupItems]);

  const { data: wpInfo, isLoading: wpLoading } = useQuery({
    queryKey: ['wpPluginInfo', slug],
    queryFn: () => getWpPluginInfo(slug),
    enabled: show && itemKind === 'plugin' && slug.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const { data: wpThemeInfo, isLoading: wpThemeLoading } = useQuery({
    queryKey: ['wpThemeInfo', slug],
    queryFn: () => getWpThemeInfo(slug),
    enabled: show && itemKind === 'theme' && slug.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const installTargetItem = useMemo(() => {
    if (!installVersionItemId) return null;
    return groupItems.find((i) => i.$id === installVersionItemId) ?? null;
  }, [installVersionItemId, groupItems]);

  const bridgeInstallPlan = useMemo(() => {
    if (!installTargetItem) return { kind: 'unsupported' as const, message: '' };
    return planLibraryBridgeInstall(installTargetItem, itemKind, slug, wpInfo, wpThemeInfo);
  }, [installTargetItem, itemKind, slug, wpInfo, wpThemeInfo]);

  const bridgeInstallWaitingForWp = useMemo(() => {
    const t = installTargetItem;
    if (!t || !itemKind) return false;
    if (itemKind === 'plugin' && t.source === 'official' && t.version === 'latest') return wpLoading;
    if (itemKind === 'theme' && t.source === 'official' && t.version === 'latest') return wpThemeLoading;
    return false;
  }, [installTargetItem, itemKind, wpLoading, wpThemeLoading]);

  const handleClose = () => {
    if (installBridgeRunning) return;
    onHide();
  };

  const runInstall = async () => {
    const target = installTargetItem;
    if (!target || !siteId) return;

    const plan = planLibraryBridgeInstall(target, itemKind, slug, wpInfo, wpThemeInfo);
    if (plan.kind === 'unsupported') {
      showNotification({
        title: 'Cannot install from Hub',
        message: plan.message,
        variant: 'warning',
      });
      return;
    }

    setInstallBridgeRunning(true);
    try {
      const result = await runLibraryBridgeInstallOnSite(siteId, plan);
      if (result.ok) {
        showNotification({ title: 'Install', message: result.message, variant: 'success' });
        if (user?.$id) {
          void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
          void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
          void queryClient.invalidateQueries({ queryKey: ['libraryItems', user.$id] });
        }
        onHide();
      } else {
        showNotification({ title: 'Install failed', message: result.message, variant: 'danger' });
      }
    } catch (e) {
      showNotification({
        title: 'Install failed',
        message: e instanceof Error ? e.message : String(e),
        variant: 'danger',
      });
    } finally {
      setInstallBridgeRunning(false);
    }
  };

  const displayName = groupItems[0]?.name?.trim() || slug || 'Library item';

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      scrollable
      backdrop={installBridgeRunning ? 'static' : true}
      keyboard={!installBridgeRunning}
    >
      <Modal.Header closeButton>
        <Modal.Title className="fs-lg">Install on this site</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          <span className="fw-medium text-body">{displayName}</span>
          {' · '}
          <a href={ROUTE_PATHS.libraryItemDetailPath(itemKind, slug)} target="_blank" rel="noreferrer">
            Open in library
          </a>
        </p>

        {groupItems.length === 0 ? (
          <p className="text-muted small mb-0">No library versions found for this slug.</p>
        ) : (
          <>
            <Form.Group className="mb-3" controlId="site-install-library-version">
              <Form.Label className="small fw-semibold">Version to install</Form.Label>
              <Form.Select
                size="sm"
                value={installVersionItemId}
                onChange={(e) => setInstallVersionItemId(e.target.value)}
                aria-label="Select library version for install"
              >
                {groupItems.map((item) => {
                  const versionShown =
                    item.source === 'official' && item.version === 'latest'
                      ? itemKind === 'theme'
                        ? wpThemeInfo?.version ?? 'latest'
                        : wpInfo?.version ?? 'latest'
                      : item.version;
                  return (
                    <option key={item.$id} value={item.$id}>
                      {versionShown} · {sourceLabel(item.source)}
                      {item.isDefault ? ' (current default)' : ''}
                    </option>
                  );
                })}
              </Form.Select>
              <Form.Text className="d-block mt-1">
                The selected version is installed as-is; your library default is not changed.
              </Form.Text>
            </Form.Group>

            {bridgeInstallWaitingForWp ? (
              <Alert variant="light" className="small mb-3 py-2">
                Loading WordPress.org version information…
              </Alert>
            ) : null}
            {!bridgeInstallWaitingForWp && bridgeInstallPlan.kind === 'unsupported' && bridgeInstallPlan.message ? (
              <Alert variant="warning" className="small mb-3 py-2">
                {bridgeInstallPlan.message}
              </Alert>
            ) : null}
            {!bridgeInstallWaitingForWp && bridgeInstallPlan.kind !== 'unsupported' ? (
              <Alert variant="info" className="small mb-3 py-2">
                {bridgeInstallPlan.kind === 'plugin-install-version'
                  ? `Will install plugin ${bridgeInstallPlan.slug} at version ${bridgeInstallPlan.version} from WordPress.org.`
                  : bridgeInstallPlan.kind === 'plugin-install-from-library'
                    ? `Will install the plugin from your uploaded library build (version ${bridgeInstallPlan.version}).`
                    : bridgeInstallPlan.kind === 'plugin-install-zip'
                      ? 'Will install the plugin from your library’s remote HTTPS ZIP URL on this site.'
                      : 'Will install the theme from the resolved ZIP package on this site.'}
              </Alert>
            ) : null}
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="gap-2">
        <Button variant="light" size="sm" onClick={handleClose} disabled={installBridgeRunning}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={
            groupItems.length === 0 ||
            !installTargetItem ||
            installBridgeRunning ||
            bridgeInstallWaitingForWp ||
            bridgeInstallPlan.kind === 'unsupported'
          }
          onClick={() => void runInstall()}
        >
          {installBridgeRunning ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Installing…
            </>
          ) : (
            'Install'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default SiteLibraryInstallOneConfirmModal;
