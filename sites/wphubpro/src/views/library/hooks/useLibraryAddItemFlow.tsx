import AddFromWordPressModal from '@/views/library/modals/AddFromWordPressModal';
import AddLibrarySourceModal from '@/views/library/modals/AddLibrarySourceModal';
import AddRemoteUrlModal from '@/views/library/modals/AddRemoteUrlModal';
import type { AddLibrarySourcePayload } from '@/views/library/modals/addLibraryTypes';
import UploadLibraryModal from '@/views/library/modals/UploadLibraryModal';
import { useCallback, useMemo, useState } from 'react';

export function useLibraryAddItemFlow(isPluginsView: boolean) {
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [wpOpen, setWpOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [addRemoteInitialName, setAddRemoteInitialName] = useState<string | undefined>(undefined);
  const [prefill, setPrefill] = useState<{ slug: string; name: string } | null>(null);

  const clearPrefill = useCallback(() => setPrefill(null), []);

  const handleAddSourceChoice = useCallback(
    (payload: AddLibrarySourcePayload) => {
      if (payload.mode === 'direct') {
        clearPrefill();
        if (payload.source === 'wordpress.org') setWpOpen(true);
        else if (payload.source === 'library_upload') setUploadOpen(true);
        else if (payload.source === 'remote_url') {
          setAddRemoteInitialName(undefined);
          setRemoteOpen(true);
        }
      } else {
        const { pluginName, pluginSlug, source } = payload;
        setPrefill({ slug: pluginSlug, name: pluginName });
        if (source === 'wordpress.org') setWpOpen(true);
        else if (source === 'library_upload') setUploadOpen(true);
        else if (source === 'remote_url') {
          setAddRemoteInitialName(pluginName);
          setRemoteOpen(true);
        }
      }
    },
    [clearPrefill],
  );

  const openAddLibraryItem = useCallback(() => setAddSourceOpen(true), []);

  const openWpOrgWithPrefill = useCallback((pluginSlug: string, pluginName: string) => {
    setPrefill({ slug: pluginSlug, name: pluginName });
    setWpOpen(true);
  }, []);

  const openUploadWithPrefill = useCallback((pluginSlug: string, pluginName?: string) => {
    setPrefill({ slug: pluginSlug, name: pluginName ?? '' });
    setUploadOpen(true);
  }, []);

  const uploadInitialType = isPluginsView ? 'plugin' : 'theme';

  const addLibraryModals = useMemo(
    () => (
      <>
        <AddLibrarySourceModal
          show={addSourceOpen}
          onHide={() => setAddSourceOpen(false)}
          isPluginsView={isPluginsView}
          onChooseSource={handleAddSourceChoice}
          existingPluginSlug={prefill?.slug}
          existingPluginName={prefill?.name}
        />
        <AddFromWordPressModal
          show={wpOpen}
          onHide={() => {
            setWpOpen(false);
            clearPrefill();
          }}
          itemKind={isPluginsView ? 'plugin' : 'theme'}
          prefillPluginSlug={prefill?.slug}
          prefillPluginName={prefill?.name}
        />
        <UploadLibraryModal
          show={uploadOpen}
          onHide={() => {
            setUploadOpen(false);
            clearPrefill();
          }}
          initialType={uploadInitialType}
          prefillPluginSlug={prefill?.slug}
        />
        <AddRemoteUrlModal
          show={remoteOpen}
          onHide={() => {
            setRemoteOpen(false);
            clearPrefill();
            setAddRemoteInitialName(undefined);
          }}
          existingPluginSlug={prefill?.slug}
          existingPluginName={prefill?.name}
          initialPluginName={addRemoteInitialName}
        />
      </>
    ),
    [
      addRemoteInitialName,
      addSourceOpen,
      clearPrefill,
      handleAddSourceChoice,
      isPluginsView,
      prefill,
      remoteOpen,
      uploadInitialType,
      uploadOpen,
      wpOpen,
    ],
  );

  return {
    openAddLibraryItem,
    openWpOrgWithPrefill,
    openUploadWithPrefill,
    addLibraryModals,
  };
}
