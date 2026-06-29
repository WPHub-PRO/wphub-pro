import { ROUTE_PATHS } from '@/config/routePaths';
import { getMemberItemKind, type ResolvedFamilyMember } from '@/domains/library';
import { parsePluginsMeta, parseThemesMeta } from '@/domains/sites/installedMeta';
import type { Site } from '@/types';
import { Fragment, useMemo, useState } from 'react';
import { Badge, Table } from 'react-bootstrap';
import { Link } from 'react-router';

type LibraryFamilyDetailSitesProps = {
  sites: Site[];
  members: ResolvedFamilyMember[];
};

function pluginDirFromFile(pluginFile: string): string {
  const t = pluginFile.trim();
  const i = t.indexOf('/');
  return (i > 0 ? t.slice(0, i) : t).toLowerCase();
}

type MemberSiteStatus = {
  installed: boolean;
  version?: string;
  status?: string;
};

function memberStatusOnSite(member: ResolvedFamilyMember, site: Site): MemberSiteStatus {
  if (member.kind === 'missing' || member.kind === 'ambiguous') {
    return { installed: false };
  }
  const itemKind = getMemberItemKind(member);
  if (!itemKind) return { installed: false };

  if (itemKind === 'plugin') {
    const plugins = parsePluginsMeta(site.pluginsMeta);
    const m = plugins.find((p) => pluginDirFromFile(p.plugin) === member.slug);
    if (!m) return { installed: false };
    return { installed: true, version: m.version, status: m.status };
  }

  const themes = parseThemesMeta(site.themesMeta);
  const m = themes.find((t) => t.stylesheet.toLowerCase() === member.slug);
  if (!m) return { installed: false };
  return { installed: true, version: m.version, status: m.status };
}

const LibraryFamilyDetailSites = ({ sites, members }: LibraryFamilyDetailSitesProps) => {
  const [expandedSiteId, setExpandedSiteId] = useState<string | null>(null);

  const connectedSites = useMemo(
    () => sites.filter((s) => s.status === 'connected'),
    [sites],
  );

  const resolvableCount = useMemo(
    () => members.filter((m) => m.kind === 'plugin' || m.kind === 'theme').length,
    [members],
  );

  const installedSites = useMemo(() => {
    if (resolvableCount === 0) return [];
    return connectedSites.filter((site) => {
      const installedCount = members.filter(
        (m) =>
          m.kind !== 'missing' &&
          m.kind !== 'ambiguous' &&
          memberStatusOnSite(m, site).installed,
      ).length;
      return installedCount === resolvableCount;
    });
  }, [connectedSites, members, resolvableCount]);

  if (resolvableCount === 0) {
    return (
      <p className="text-muted mb-0">
        Add library members before checking site coverage.
      </p>
    );
  }

  if (connectedSites.length === 0) {
    return <p className="text-muted mb-0">No connected sites in this workspace yet.</p>;
  }

  if (installedSites.length === 0) {
    return (
      <p className="text-muted mb-0">
        No sites in this workspace have the full family installed yet.
      </p>
    );
  }

  return (
    <div className="table-responsive border rounded">
      <Table hover size="sm" className="mb-0 align-middle">
        <thead className="table-light">
          <tr>
            <th>Site</th>
            <th>Coverage</th>
            <th className="text-end">Details</th>
          </tr>
        </thead>
        <tbody>
          {installedSites.map((site) => {
            const statuses = members.map((m) => ({
              member: m,
              status: memberStatusOnSite(m, site),
            }));
            const installedCount = statuses.filter(
              (s) => s.member.kind !== 'missing' && s.member.kind !== 'ambiguous' && s.status.installed,
            ).length;
            const expanded = expandedSiteId === site.$id;
            const siteTab =
              members.some((m) => m.kind === 'theme') && !members.some((m) => m.kind === 'plugin')
                ? 'themes'
                : 'plugins';

            return (
              <Fragment key={site.$id}>
                <tr className="library-family-site-row">
                  <td>
                    <Link
                      to={`${ROUTE_PATHS.siteDetailPath(site.$id)}?tab=${siteTab}`}
                      className="fw-medium text-decoration-none"
                    >
                      {site.siteName?.trim() || site.$id}
                    </Link>
                  </td>
                  <td>
                    <Badge
                      bg={installedCount === resolvableCount ? 'success' : 'secondary'}
                      className="bg-opacity-10 text-body"
                    >
                      {installedCount} / {resolvableCount} installed
                    </Badge>
                  </td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      onClick={() => setExpandedSiteId(expanded ? null : site.$id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? 'Hide' : 'Show'} members
                    </button>
                  </td>
                </tr>
                {expanded ? (
                  <tr key={`${site.$id}-detail`}>
                    <td colSpan={3} className="p-0 border-0">
                      <div className="px-3 py-2 bg-light bg-opacity-25">
                        <Table size="sm" className="mb-0">
                          <thead>
                            <tr className="fs-xxs text-muted">
                              <th>Member</th>
                              <th>Installed</th>
                              <th>Version</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statuses.map(({ member, status }) => (
                              <tr key={member.slug}>
                                <td>{member.displayName}</td>
                                <td>{status.installed ? 'Yes' : 'No'}</td>
                                <td>{status.version ?? '—'}</td>
                                <td>
                                  {status.status ? (
                                    <span className="badge bg-secondary bg-opacity-10 text-secondary">
                                      {status.status}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};

export default LibraryFamilyDetailSites;
