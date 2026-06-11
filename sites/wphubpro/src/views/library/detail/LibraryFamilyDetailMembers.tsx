import { ROUTE_PATHS } from '@/config/routePaths';
import {
  buildInstallVersionOptions,
  pickLibraryItemForMember,
  type ResolvedFamilyMember,
} from '@/domains/library';
import {
  useUpdateLibraryFamilyMemberPreferences,
  useUpdateLibraryFamilyMemberSlugs,
} from '@/hooks/useLibraryFamiliesAndCollections';
import { getWpPluginInfo, getWpThemeInfo } from '@/services/wordpress';
import type { LibraryFamily, LibraryItem } from '@/types';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Badge, Button, Form, Table } from 'react-bootstrap';
import { Link } from 'react-router';

type LibraryFamilyDetailMembersProps = {
  family: LibraryFamily;
  members: ResolvedFamilyMember[];
  busy?: boolean;
};

function memberKindBadge(member: ResolvedFamilyMember) {
  if (member.kind === 'plugin') {
    return <Badge bg="primary" className="bg-opacity-10 text-primary">Plugin</Badge>;
  }
  if (member.kind === 'theme') {
    return <Badge bg="info" className="bg-opacity-10 text-info">Theme</Badge>;
  }
  if (member.kind === 'ambiguous') {
    return <Badge bg="warning" className="bg-opacity-10 text-warning">Ambiguous</Badge>;
  }
  return <Badge bg="secondary" className="bg-opacity-10 text-secondary">Not in library</Badge>;
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

const LibraryFamilyDetailMembers = ({ family, members, busy = false }: LibraryFamilyDetailMembersProps) => {
  const updateSlugs = useUpdateLibraryFamilyMemberSlugs();
  const updatePrefs = useUpdateLibraryFamilyMemberPreferences();

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

  const handleRemove = (slug: string) => {
    const next = family.memberSlugs.filter((s) => s.toLowerCase() !== slug.toLowerCase());
    updateSlugs.mutate({ familyId: family.$id, memberSlugs: next });
  };

  const handleVersionChange = (slug: string, versionKey: string) => {
    const prefs = { ...(family.memberPreferences ?? {}) };
    prefs[slug.toLowerCase()] = { versionKey };
    updatePrefs.mutate({ familyId: family.$id, memberPreferences: prefs });
  };

  const isBusy = busy || updateSlugs.isPending || updatePrefs.isPending;

  if (members.length === 0) {
    return <p className="text-muted mb-0">No members yet. Use Edit members to add slugs.</p>;
  }

  return (
    <div className="table-responsive border rounded">
      <Table hover className="table table-custom table-centered mb-0 align-middle">
        <thead className="bg-light bg-opacity-25 thead-sm">
          <tr className="text-uppercase fs-xxs">
            <th>Name</th>
            <th>Type</th>
            <th>Sources</th>
            <th>Install version</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const items =
              member.kind === 'plugin' || member.kind === 'theme'
                ? member.items
                : member.kind === 'ambiguous'
                  ? [...member.pluginItems, ...member.themeItems]
                  : [];

            const itemKind = member.kind === 'plugin' || member.kind === 'theme' ? member.itemKind : null;
            const versionOptions =
              itemKind && (member.kind === 'plugin' || member.kind === 'theme')
                ? buildInstallVersionOptions(
                    member.items,
                    itemKind,
                    wpPluginBySlug[member.slug],
                    wpThemeBySlug[member.slug],
                  )
                : [];

            const selectedKey =
              family.memberPreferences?.[member.slug]?.versionKey ??
              (member.kind === 'plugin' || member.kind === 'theme'
                ? pickLibraryItemForMember(member.items, family.memberPreferences?.[member.slug])?.$id
                : '');

            const detailLink =
              member.kind === 'plugin'
                ? ROUTE_PATHS.libraryItemDetailPath('plugin', member.slug)
                : member.kind === 'theme'
                  ? ROUTE_PATHS.libraryItemDetailPath('theme', member.slug)
                  : null;

            return (
              <tr key={member.slug}>
                <td>
                  {detailLink ? (
                    <Link to={detailLink} className="fw-medium text-decoration-none">
                      {member.displayName}
                    </Link>
                  ) : (
                    <span className="fw-medium">{member.displayName}</span>
                  )}
                  <div className="text-muted fs-xxs">{member.slug}</div>
                </td>
                <td>{memberKindBadge(member)}</td>
                <td>{sourceBadges(items)}</td>
                <td>
                  {versionOptions.length > 0 ? (
                    <Form.Select
                      size="sm"
                      value={selectedKey}
                      disabled={isBusy}
                      onChange={(e) => handleVersionChange(member.slug, e.target.value)}
                      aria-label={`Version for ${member.slug}`}
                      style={{ minWidth: '12rem' }}
                    >
                      {versionOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </Form.Select>
                  ) : (
                    <span className="text-muted fs-xs">—</span>
                  )}
                </td>
                <td className="text-end">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => handleRemove(member.slug)}
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

export default LibraryFamilyDetailMembers;
