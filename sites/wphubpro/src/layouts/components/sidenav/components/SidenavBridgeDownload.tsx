import { useAuth } from '@/domains/auth';
import {
  downloadBridgePluginZip,
  fetchBridgeDownloadMeta,
  fetchBridgeLatestVersion,
} from '@/domains/bridge/bridgeRelease';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Spinner } from 'react-bootstrap';
import { TbDownload, TbPuzzle } from 'react-icons/tb';

type SidenavBridgeDownloadProps = {
  /** Narrow rail (`condensed` / `on-hover`): icon-only. Wide sidebar: full bridge panel. */
  sidebarCollapsed: boolean;
};

const SidenavBridgeDownload = ({ sidebarCollapsed }: SidenavBridgeDownloadProps) => {
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  const { data: versionInfo, isLoading: versionLoading } = useQuery({
    queryKey: ['bridge', 'advertised_version'],
    queryFn: async () => {
      const r = await fetchBridgeLatestVersion();
      return r?.version?.trim() || null;
    },
    enabled: Boolean(user) && !sidebarCollapsed,
    staleTime: 5 * 60_000,
    retry: 1,
    throwOnError: false,
  });

  const download = useMutation({
    mutationFn: async () => {
      const meta = await fetchBridgeDownloadMeta();
      const fileId = meta?.fileId?.trim();
      if (!fileId) throw new Error('No bridge file id returned.');
      const name =
        (meta.fileName && meta.fileName.trim()) ||
        (meta.version ? `wphub-bridge-${meta.version}.zip` : 'wphub-bridge.zip');
      await downloadBridgePluginZip(fileId, name);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Could not download the bridge plugin.';
      showNotification({ message, variant: 'danger' });
    },
    onSuccess: () => {
      showNotification({ message: 'Bridge plugin download started.', variant: 'success' });
    },
  });

  if (!user) return null;

  if (sidebarCollapsed) {
    return (
      <div className="sidenav-bridge-icon-wrap">
        <button
          type="button"
          className="sidenav-bridge-icon-btn"
          disabled={download.isPending}
          title="Download WordPress bridge plugin"
          aria-label="Download WordPress bridge plugin"
          onClick={() => download.mutate()}
        >
          {download.isPending ? (
            <Spinner animation="border" size="sm" className="sidenav-bridge-panel__spinner" role="status" />
          ) : (
            <TbDownload className="sidenav-bridge-icon-btn__glyph" aria-hidden />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="sidenav-bridge-panel">
      <div className="sidenav-bridge-panel__header">
        <span className="sidenav-bridge-panel__brand" aria-hidden>
          <TbPuzzle className="sidenav-bridge-panel__brand-icon" />
        </span>
        <div className="sidenav-bridge-panel__heading">
          <div className="sidenav-bridge-panel__label">WordPress bridge</div>
          <div className="sidenav-bridge-panel__meta">
            {versionLoading ? (
              <Spinner animation="border" size="sm" className="sidenav-bridge-panel__spinner" role="status" />
            ) : versionInfo ? (
              <>Version {versionInfo}</>
            ) : (
              <span className="sidenav-bridge-panel__muted">Latest release</span>
            )}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="sidenav-bridge-panel__btn"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        {download.isPending ? (
          <Spinner animation="border" size="sm" className="sidenav-bridge-panel__spinner" role="status" />
        ) : (
          <TbDownload className="sidenav-bridge-panel__btn-icon" aria-hidden />
        )}
        <span>Download plugin</span>
      </button>
    </div>
  );
};

export default SidenavBridgeDownload;
