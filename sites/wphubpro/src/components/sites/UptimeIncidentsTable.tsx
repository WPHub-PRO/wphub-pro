import { ROUTE_PATHS } from '@/config/routePaths';
import { incidentMonitorId } from '@/lib/uptimeIncidentHours';
import {
  incidentDurationDisplay,
  incidentIso,
  incidentRootCause,
  incidentStatusBadgeVariant,
  incidentStatusLabel,
  splitRootCauseAndStatusCode,
} from '@/lib/uptimeIncidentDisplay';
import { formatChecked } from '@/views/sites/detail/siteDetailFormat';
import clsx from 'clsx';
import { Link } from 'react-router';
import { Table } from 'react-bootstrap';
import { TbArrowDown, TbArrowUp } from 'react-icons/tb';

export type UptimeIncidentSiteLabel = {
  label: string;
  siteId?: string;
};

export type UptimeIncidentSortColumn = 'site' | 'status' | 'rootCause' | 'started' | 'duration';

export type UptimeIncidentSort = {
  column: UptimeIncidentSortColumn;
  direction: 'asc' | 'desc';
};

type UptimeIncidentsTableProps = {
  incidents: Record<string, unknown>[];
  emptyMessage?: string;
  showSiteColumn?: boolean;
  resolveSiteLabel?: (monitorId: string) => UptimeIncidentSiteLabel | null;
  sortable?: boolean;
  sort?: UptimeIncidentSort | null;
  onSortChange?: (column: UptimeIncidentSortColumn) => void;
};

function SortableHeader({
  label,
  column,
  sort,
  onSortChange,
}: {
  label: string;
  column: UptimeIncidentSortColumn;
  sort?: UptimeIncidentSort | null;
  onSortChange?: (column: UptimeIncidentSortColumn) => void;
}) {
  const isActive = sort?.column === column;
  const direction = isActive ? sort.direction : null;

  return (
    <th
      scope="col"
      onClick={() => onSortChange?.(column)}
      style={{
        cursor: onSortChange ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <div className="d-flex align-items-center">
        {label}
        {direction === 'asc' ? <TbArrowUp className="ms-1" /> : null}
        {direction === 'desc' ? <TbArrowDown className="ms-1" /> : null}
      </div>
    </th>
  );
}

export default function UptimeIncidentsTable({
  incidents,
  emptyMessage = 'No incidents recorded in this window.',
  showSiteColumn = false,
  resolveSiteLabel,
  sortable = false,
  sort = null,
  onSortChange,
}: UptimeIncidentsTableProps) {
  if (incidents.length === 0) {
    return <p className="text-muted fs-sm mb-0">{emptyMessage}</p>;
  }

  const canSort = sortable && typeof onSortChange === 'function';

  return (
    <div className="table-responsive border rounded">
      <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
        <thead className="bg-light align-middle bg-opacity-25 thead-sm">
          <tr className={clsx('fs-xxs text-muted', canSort && 'text-uppercase')}>
            {showSiteColumn ? (
              canSort ? (
                <SortableHeader label="Site" column="site" sort={sort} onSortChange={onSortChange} />
              ) : (
                <th scope="col">Site</th>
              )
            ) : null}
            {canSort ? (
              <SortableHeader label="Status" column="status" sort={sort} onSortChange={onSortChange} />
            ) : (
              <th scope="col">Status</th>
            )}
            {canSort ? (
              <SortableHeader label="Root Cause" column="rootCause" sort={sort} onSortChange={onSortChange} />
            ) : (
              <th scope="col">Root Cause</th>
            )}
            {canSort ? (
              <SortableHeader label="Started" column="started" sort={sort} onSortChange={onSortChange} />
            ) : (
              <th scope="col">Started</th>
            )}
            {canSort ? (
              <SortableHeader label="Duration" column="duration" sort={sort} onSortChange={onSortChange} />
            ) : (
              <th scope="col">Duration</th>
            )}
          </tr>
        </thead>
        <tbody>
          {incidents.map((row, i) => {
            const r = row as Record<string, unknown>;
            const iso = incidentIso(r);
            const status = incidentStatusLabel(r);
            const stVariant = incidentStatusBadgeVariant(status);
            const root = incidentRootCause(r);
            const { code, rest } = splitRootCauseAndStatusCode(root);
            const restText = code ? rest : root;
            const monitorId = incidentMonitorId(r);
            const siteInfo = showSiteColumn && resolveSiteLabel ? resolveSiteLabel(monitorId) : null;

            return (
              <tr key={`inc-${i}-${iso ?? i}`}>
                {showSiteColumn ? (
                  <td className="fs-xs text-nowrap">
                    {siteInfo?.siteId ? (
                      <Link
                        to={`${ROUTE_PATHS.siteDetailPath(siteInfo.siteId)}?tab=health`}
                        className="text-decoration-none"
                      >
                        {siteInfo.label}
                      </Link>
                    ) : (
                      <span className="text-muted">{siteInfo?.label ?? '—'}</span>
                    )}
                  </td>
                ) : null}
                <td className="text-nowrap">
                  <span className={`badge badge-soft-${stVariant} text-uppercase fs-xxs`}>{status}</span>
                </td>
                <td className="fs-xs">
                  <div className="d-flex flex-wrap align-items-center column-gap-2 row-gap-1">
                    {code ? (
                      <span className="badge badge-soft-danger fs-xxs flex-shrink-0">{code}</span>
                    ) : null}
                    {restText ? <span className="text-break">{restText}</span> : null}
                  </div>
                </td>
                <td className="text-muted fs-xs text-nowrap">{formatChecked(iso)}</td>
                <td className="text-muted fs-xs text-nowrap">{incidentDurationDisplay(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
