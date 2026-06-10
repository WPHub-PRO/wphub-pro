import ComponentCard from '@/components/cards/ComponentCard';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import {
  formatTicketAge,
  useAdminDashboardTicketStats,
  type AdminTicketTabId,
} from '@/domains/admin-dashboard';
import type { Ticket } from '@/types';
import { formatTicketStatus, statusBadgeClass } from '@/views/support/supportUi';
import { useMemo, useState } from 'react';
import { Badge, Button, Nav, Spinner, Tab, Table } from 'react-bootstrap';
import CountUp from 'react-countup';
import { Link } from 'react-router';
import { TbLifebuoy } from 'react-icons/tb';

function TicketStatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-dashboard-stat-tile border rounded p-2 text-center h-100">
      <h4 className="mb-0 fw-semibold">
        <CountUp end={value} duration={0.8} preserveValue />
      </h4>
      <p className="text-muted small mb-0 mt-1">{label}</p>
    </div>
  );
}

function LongestWaitingTable({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) {
    return <p className="text-muted small mb-0">No active tickets in the queue.</p>;
  }
  return (
    <div className="table-responsive">
      <Table size="sm" hover className="mb-0 align-middle">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Status</th>
            <th className="text-end">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.$id}>
              <td>
                <Link
                  to={ROUTE_PATHS.supportTicketPath(t.$id)}
                  className="fw-medium text-truncate d-inline-block"
                  style={{ maxWidth: '16rem' }}
                >
                  {t.subject}
                </Link>
                {t.priority === 'urgent' || t.priority === 'high' ? (
                  <Badge bg="danger" className="ms-1">
                    {t.priority}
                  </Badge>
                ) : null}
              </td>
              <td>
                <span className={`badge ${statusBadgeClass(t.status)}`}>{formatTicketStatus(t.status)}</span>
              </td>
              <td className="text-end text-muted small">{formatTicketAge(t.$updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default function HelpdeskTicketsCard() {
  const { user } = useAuth();
  const { isLoading, stats } = useAdminDashboardTicketStats(user?.$id);
  const [tab, setTab] = useState<AdminTicketTabId>('overview');

  const pills = useMemo(
    () => [
      { label: 'New', value: stats.newCount },
      { label: 'Waiting reply', value: stats.waitingReplyCount },
      { label: 'Assigned to you', value: stats.assignedToMeCount },
      { label: 'Active', value: stats.activeCount },
    ],
    [stats],
  );

  return (
    <ComponentCard
      title="Helpdesk"
      className="admin-dashboard-card h-100 w-100"
      fillColumnHeight
      bodyClassName="admin-dashboard-card-body d-flex flex-column min-h-0 pt-2"
      titleExtra={
        <Badge bg="secondary-subtle" text="secondary" className="fw-normal">
          {stats.activeCount} active
        </Badge>
      }
      headerActions={
        <Button as={Link} to={ROUTE_PATHS.ADMIN_SUPPORT} variant="outline-primary" size="sm">
          Open queue
        </Button>
      }
    >
      {isLoading ? (
        <div className="d-flex justify-content-center py-4">
          <Spinner animation="border" size="sm" variant="primary" />
        </div>
      ) : (
        <>
          <div className="row g-2 admin-dashboard-helpdesk-pills flex-shrink-0">
            {pills.map((p) => (
              <div key={p.label} className="col-6 col-sm-3">
                <TicketStatPill label={p.label} value={p.value} />
              </div>
            ))}
          </div>

          <div className="admin-dashboard-helpdesk-tabs d-flex flex-column flex-grow-1 min-h-0">
            <Tab.Container
              activeKey={tab}
              onSelect={(k) => setTab((k as AdminTicketTabId) || 'overview')}
            >
            <Nav variant="tabs" className="nav-tabs-custom mb-2 flex-shrink-0">
              <Nav.Item>
                <Nav.Link eventKey="overview">
                  <TbLifebuoy className="me-1" />
                  Overview
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="longest">Longest waiting</Nav.Link>
              </Nav.Item>
            </Nav>
            <Tab.Content className="admin-dashboard-scroll flex-grow-1">
              <Tab.Pane eventKey="overview">
                <p className="text-muted small mb-2">
                  <strong>New</strong> = open · <strong>Waiting reply</strong> = customer turn
                </p>
                <LongestWaitingTable tickets={stats.longestWaiting.slice(0, 5)} />
              </Tab.Pane>
              <Tab.Pane eventKey="longest">
                <LongestWaitingTable tickets={stats.longestWaiting} />
              </Tab.Pane>
            </Tab.Content>
            </Tab.Container>
          </div>
        </>
      )}
    </ComponentCard>
  );
}
