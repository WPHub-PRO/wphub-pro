import { ROUTE_PATHS } from '@/config/routePaths';
import { getInstalledPluginWpSlug } from '@/domains/sites/installedPluginLibraryMatch';
import { getLibraryItemSlug } from '@/domains/library/libraryItemSlug';
import { useAddOfficialPlugin } from '@/hooks/useLibrary';
import { getWpPluginInfo } from '@/services/wordpress';
import type { WordPressPlugin } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/domains/auth';
import { Button, Card, CardBody, Spinner } from 'react-bootstrap';
import { TbCloudDownload, TbUpload } from 'react-icons/tb';
import { useNavigate } from 'react-router';

type SitePluginAddToLibraryCardProps = {
  plugin: WordPressPlugin;
  onUploadZip: () => void;
};

const SitePluginAddToLibraryCard = ({ plugin, onUploadZip }: SitePluginAddToLibraryCardProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const slug = getInstalledPluginWpSlug(plugin);
  const addOfficial = useAddOfficialPlugin();

  const { data: orgInfo, isLoading: orgLoading, isError: orgError } = useQuery({
    queryKey: ['wpPluginInfo', slug],
    queryFn: () => getWpPluginInfo(slug),
    enabled: Boolean(slug),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const orgAvailable = Boolean(orgInfo?.version && orgInfo.slug);
  const orgBusy = addOfficial.isPending;

  const handleAddFromWordPressOrg = () => {
    if (!orgInfo?.version) return;
    const authorRaw = orgInfo.author;
    const author =
      typeof authorRaw === 'string'
        ? authorRaw.replace(/<[^>]*>/g, '').trim()
        : (plugin.author ?? '').trim();

    addOfficial.mutate(
      {
        name: orgInfo.name ?? plugin.name ?? slug,
        slug: orgInfo.slug ?? slug,
        version: 'latest',
        author: author || 'Unknown',
        short_description: plugin.description ?? orgInfo.description,
        prefillPluginSlug: slug,
        prefillPluginName: plugin.name,
      },
      {
        onSuccess: (item) => {
          void queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
          const detailSlug = getLibraryItemSlug(item);
          navigate(ROUTE_PATHS.libraryItemDetailPath('plugin', detailSlug));
        },
      },
    );
  };

  return (
    <Card className="border border-dashed shadow-none mt-3">
      <CardBody>
        <p className="text-muted fs-xs text-uppercase fw-semibold mb-1">Workspace library</p>
        <p className="small mb-3">
          This plugin is not in your workspace library yet. Add it to manage versions and install on other sites.
        </p>
        <div className="d-flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="d-inline-flex align-items-center gap-2"
            disabled={!slug || orgLoading || !orgAvailable || orgBusy}
            onClick={handleAddFromWordPressOrg}
          >
            {orgBusy ? (
              <Spinner animation="border" size="sm" />
            ) : (
              <TbCloudDownload className="fs-lg" aria-hidden />
            )}
            Add from WordPress.org
          </Button>
          <Button
            type="button"
            variant="outline-primary"
            size="sm"
            className="d-inline-flex align-items-center gap-2"
            disabled={!slug || orgBusy}
            onClick={onUploadZip}
          >
            <TbUpload className="fs-lg" aria-hidden />
            Upload ZIP
          </Button>
        </div>
        {slug && orgLoading && (
          <p className="text-muted fs-xs mb-0 mt-2">
            <Spinner animation="border" size="sm" className="me-1" />
            Checking WordPress.org…
          </p>
        )}
        {slug && !orgLoading && !orgAvailable && (
          <p className="text-muted fs-xs mb-0 mt-2">
            {orgError
              ? 'Could not verify this plugin on WordPress.org. Use a local ZIP upload instead.'
              : 'Not listed on WordPress.org for this slug. Use a local ZIP upload to add it.'}
          </p>
        )}
      </CardBody>
    </Card>
  );
};

export default SitePluginAddToLibraryCard;
