import { ROUTE_PATHS } from '@/config/routePaths';
import {
  buildInstallVersionOptions,
  memberRowKey,
  pickLibraryItemForCollectionMember,
  removeCollectionMemberFromList,
  updateCollectionMemberInList,
  type ResolvedCollectionMember,
} from '@/domains/library';
import { useUpdateLibraryCollectionItems } from '@/hooks/useLibraryFamiliesAndCollections';
import { getWpPluginInfo, getWpThemeInfo } from '@/services/wordpress';
import type { LibraryCollection, LibraryCollectionMember, LibraryItem } from '@/types';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Badge, Button, Form, Table } from 'react-bootstrap';
import { Link } from 'react-router';

type LibraryCollectionDetailItemsProps = {
  collection: LibraryCollection;
  members: ResolvedCollectionMember[];
  busy?: boolean;
};

function typeBadge(type: 'plugin' | 'theme') {
  if (type === 'plugin') {
    return <Badge bg="primary" className="bg-opacity-10 text-primary">Plugin</Badge>;
  }
  return <Badge bg="info" className="bg-opacity-10 text-info">Theme</Badge>;
}

function sourceBadges(items: LibraryItem[]) {
  const sources = [...new Set(items.map((i) => i.source))];
  if (sources.length === 0) return <span className="text-muted fs-xs">—</span>;
  return (
    <span className="d-flex flex-wrap gap-1">
      {sources.map((s) => (
        <span key={s} className="badge badge-soft-secondary fs-xxs">
          {s === 'official' ? 'WP.org' : s === 'local' ? 'Uploaded' : 'Remote'}
        </span>
      ))}
    </span>
  );
}

const LibraryCollectionDetailItems = ({
  collection,
  members,
  busy = false,
}: LibraryCollectionDetailItemsProps) => {
  const updateItems = useUpdateLibraryCollectionItems();

  const pluginSlugs = useMemo(
    () => members.filter((m) => m.kind === 'resolved' && m.type === 'plugin').map((m) => m.slug),
    [members],
  );
  const themeSlugs = useMemo(
    () => members.filter((m) => m.kind === 'resolved' && m.type === 'theme').map((m) => m.slug),
    [members],
  );

  const wpPluginQueries = useQueries({
    queries: pluginSlugs.map((slug) => ({
      queryKey: ['wpPluginInfo', slug],
      queryFn: () => getWpPluginInfo(slug),
      staleTime: 1000 * 60 * 10,
    })),
  });

  const wpThemeQueries = useQueries({
    queries: themeSlugs.map((slug) => ({
      queryKey: ['wpThemeInfo', slug],
      queryFn: () => getWpThemeInfo(slug),
      staleTime: 1000 * 60 * 10,
    })),
  });

  const wpPluginBySlug = useMemo(() => {
    const map: Record<string, (typeof wpPluginQueries)[0]['data']> = {};
    pluginSlugs.forEach((slug, i) => {
      map[slug] = wpPluginQueries[i]?.data;
    });
    return map;
  }, [pluginSlugs, wpPluginQueries]);

  const wpThemeBySlug = useMemo(() => {
    const map: Record<string, (typeof wpThemeQueries)[0]['data']> = {};
    themeSlugs.forEach((slug, i) => {
      map[slug] = wpThemeQueries[i]?.data;
    });
    return map;
  }, [themeSlugs, wpThemeQueries]);

  const persistItems = (items: LibraryCollectionMember[]) => {
    updateItems.mutate({ collectionId: collection.$id, items });
  };

  const handleRemove = (rowKey: string) => {
    persistItems(removeCollectionMemberFromList(collection.items, rowKey));
  };

  const handleVersionModeChange = (rowKey: string, versionMode: 'default' | 'manual') => {
    if (versionMode === 'default') {
      persistItems(
        collection.items.map((m) => {
          if (memberRowKey(m) !== rowKey) return m;
          const { manualVersionKey: _omit, ...rest } = m;
          void _omit;
          return { ...rest, versionMode: 'default' as const };
        }),
      );
      return;
    }
    const resolved = members.find((m) => memberRowKey(m.member) === rowKey);
    const defaultItemId =
      resolved?.kind === 'resolved'
        ? pickLibraryItemForCollectionMember(resolved.items, {
            ...resolved.member,
            versionMode: 'default',
          })?.$id
        : undefined;
    persistItems(
      updateCollectionMemberInList(collection.items, rowKey, {
        versionMode: 'manual',
        ...(defaultItemId ? { manualVersionKey: defaultItemId } : {}),
      }),
    );
  };

  const handleManualVersionChange = (rowKey: string, manualVersionKey: string) => {
    persistItems(
      updateCollectionMemberInList(collection.items, rowKey, {
        versionMode: 'manual',
        manualVersionKey,
      }),
    );
  };

  const isBusy = busy || updateItems.isPending;

  if (members.length === 0) {
    return <p className="text-muted mb-0">No items yet. Use Edit items to add library entries.</p>;
  }

  return (
    <div className="table-responsive border rounded">
      <Table hover className="table table-custom table-centered mb-0 align-middle">
        <thead className="bg-light bg-opacity-25 thead-sm">
          <tr className="text-uppercase fs-xxs">
            <th>Name</th>
            <th>Type</th>
            <th>Sources</th>
            <th>Version mode</th>
            <th>Install version</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((resolved) => {
            const rowKey = memberRowKey(resolved.member);
            const items = resolved.kind === 'resolved' ? resolved.items : [];
            const versionOptions =
              resolved.kind === 'resolved'
                ? buildInstallVersionOptions(
                    resolved.items,
                    resolved.type,
                    wpPluginBySlug[resolved.slug],
                    wpThemeBySlug[resolved.slug],
                  )
                : [];

            const picked =
              resolved.kind === 'resolved'
                ? pickLibraryItemForCollectionMember(resolved.items, resolved.member)
                : null;

            const selectedManualKey =
              resolved.member.versionMode === 'manual' && resolved.member.manualVersionKey
                ? resolved.member.manualVersionKey
                : picked?.$id ?? '';

            const defaultLabel =
              picked && versionOptions.length > 0
                ? versionOptions.find((o) => o.key === picked.$id)?.label ?? picked.version
                : '—';

            return (
              <tr key={rowKey}>
                <td>
                  {resolved.kind === 'resolved' ? (
                    <Link
                      to={ROUTE_PATHS.libraryItemDetailPath(resolved.type, resolved.slug)}
                      className="fw-medium text-decoration-none"
                    >
                      {resolved.displayName}
                    </Link>
                  ) : (
                    <span className="fw-medium">{resolved.displayName}</span>
                  )}
                  <div className="text-muted fs-xxs">{resolved.slug}</div>
                  {resolved.kind === 'missing' ? (
                    <Badge bg="secondary" className="bg-opacity-10 text-secondary mt-1">
                      Not in library
                    </Badge>
                  ) : null}
                </td>
                <td>{typeBadge(resolved.type)}</td>
                <td>{sourceBadges(items)}</td>
                <td>
                  {resolved.kind === 'resolved' ? (
                    <Form.Select
                      size="sm"
                      value={resolved.member.versionMode}
                      disabled={isBusy}
                      onChange={(e) =>
                        handleVersionModeChange(rowKey, e.target.value as 'default' | 'manual')
                      }
                      aria-label={`Version mode for ${resolved.slug}`}
                      style={{ minWidth: '7rem' }}
                    >
                      <option value="default">Default</option>
                      <option value="manual">Manual</option>
                    </Form.Select>
                  ) : (
                    <span className="text-muted fs-xs">—</span>
                  )}
                </td>
                <td>
                  {resolved.kind === 'resolved' && resolved.member.versionMode === 'manual' ? (
                    <Form.Select
                      size="sm"
                      value={selectedManualKey}
                      disabled={isBusy}
                      onChange={(e) => handleManualVersionChange(rowKey, e.target.value)}
                      aria-label={`Version for ${resolved.slug}`}
                      style={{ minWidth: '12rem' }}
                    >
                      {versionOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </Form.Select>
                  ) : resolved.kind === 'resolved' ? (
                    <span className="text-muted fs-xs">{defaultLabel}</span>
                  ) : (
                    <span className="text-muted fs-xs">—</span>
                  )}
                </td>
                <td className="text-end">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleRemove(rowKey)}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};

export default LibraryCollectionDetailItems;
