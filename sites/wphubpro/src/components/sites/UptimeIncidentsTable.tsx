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
import { Link } from 'react-router';
import { Table } from 'react-bootstrap';

export type UptimeIncidentSiteLabel = {
  label: string;
  siteId?: string;
};

type UptimeIncidentsTableProps = {
  incidents: Record<string, unknown>[];
  emptyMessage?: string;
  showSiteColumn?: boolean;
  resolveSiteLabel?: (monitorId: string) => UptimeIncidentSiteLabel | null;
};

export default function UptimeIncidentsTable({
  incidents,
  emptyMessage = 'No incidents recorded in this window.',
  showSiteColumn = false,
  resolveSiteLabel,
}: UptimeIncidentsTableProps) {
  if (incidents.length === 0) {
    return <p className="text-muted fs-sm mb-0">{emptyMessage}</p>;
  }

  return (
    <div className="table-responsive border rounded">
      <Table hover size="sm" className="table table-custom table-centered table-nowrap mb-0 align-middle">
        <thead className="bg-light align-middle bg-opacity-25 thead-sm">
          <tr className="fs-xxs text-muted">
            {showSiteColumn ? <th scope="col">Site</th> : null}
            <th scope="col">Status</th>
            <th scope="col">Root Cause</th>
            <th scope="col">Started</th>
            <th scope="col">Duration</th>
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
