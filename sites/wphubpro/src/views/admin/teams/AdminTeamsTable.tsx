import { TABLE_ACTION_ICON_LIGHT_CLASS } from '@/components/table/tableActionClasses';
import { ROUTE_PATHS } from '@/config/routePaths';
import type { AdminTeamListRow } from '@/domains/admin/useAdminTeams';
import { Table } from 'react-bootstrap';
import { TbListDetails } from 'react-icons/tb';
import { Link } from 'react-router';

type AdminTeamsTableProps = {
  rows: AdminTeamListRow[];
};

function formatCreated(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '—';
  }
}

const AdminTeamsTable = ({ rows }: AdminTeamsTableProps) => {
  return (
    <div className="table-responsive border rounded">
      <Table hover className="table table-custom table-centered table-nowrap mb-0 align-middle">
        <thead className="bg-light align-middle bg-opacity-25 thead-sm">
          <tr className="text-uppercase fs-xxs">
            <th>Team</th>
            <th>Team ID</th>
            <th>Owner</th>
            <th className="text-end">Members</th>
            <th className="text-end">Seats</th>
            <th>Created</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const displayName = r.teamName?.trim() || '—';
            const members = typeof r.memberCount === 'number' ? r.memberCount : '—';
            return (
              <tr key={r.teamId}>
                <td>
                  <span className="fw-medium text-truncate d-inline-block" style={{ maxWidth: '14rem' }} title={displayName}>
                    {displayName}
                  </span>
                </td>
                <td>
                  <span className="font-monospace text-muted fs-xs text-truncate d-inline-block" style={{ maxWidth: '12rem' }} title={r.teamId}>
                    {r.teamId}
                  </span>
                </td>
                <td>
                  <span
                    className="font-monospace text-muted fs-xs text-truncate d-inline-block"
                    style={{ maxWidth: '10rem' }}
                    title={r.ownerId || undefined}
                  >
                    {r.ownerId || '—'}
                  </span>
                </td>
                <td className="text-end text-muted fs-xs">{members}</td>
                <td className="text-end text-muted fs-xs">{r.maxSeats ?? '—'}</td>
                <td className="text-muted fs-xs text-nowrap">{formatCreated(r.$createdAt)}</td>
                <td className="text-end">
                  <Link
                    className={TABLE_ACTION_ICON_LIGHT_CLASS}
                    to={ROUTE_PATHS.adminTeamPath(r.teamId)}
                    aria-label={`Open team ${displayName}`}
                    title={`Open team ${displayName}`}
                  >
                    <TbListDetails className="fs-lg" aria-hidden />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};

export default AdminTeamsTable;
