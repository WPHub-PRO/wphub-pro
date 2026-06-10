import ComponentCard from '@/components/cards/ComponentCard';
import { useAdminDashboardPlatformStats } from '@/domains/admin-dashboard';
import { Col, Row, Spinner } from 'react-bootstrap';
import CountUp from 'react-countup';
import { TbBuilding, TbPlugConnected, TbUsers, TbWorld } from 'react-icons/tb';

type StatItem = {
  id: string;
  label: string;
  value: number | undefined;
  hint?: string;
  icon: typeof TbUsers;
  tone: string;
};

function StatTile({ item }: { item: StatItem }) {
  const Icon = item.icon;
  return (
    <Col sm={6} lg={3}>
      <div className="admin-dashboard-stat-tile border rounded p-2 p-sm-3 h-100">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div>
            <p className="text-muted small mb-1">{item.label}</p>
            <h4 className="mb-0 fw-semibold">
              {item.value == null ? (
                '—'
              ) : (
                <CountUp end={item.value} duration={0.8} preserveValue />
              )}
            </h4>
            {item.hint ? <p className="text-muted small mb-0 mt-1">{item.hint}</p> : null}
          </div>
          <span className={`avatar-title bg-${item.tone}-subtle text-${item.tone} rounded-circle fs-20 d-inline-flex p-2`}>
            <Icon />
          </span>
        </div>
      </div>
    </Col>
  );
}

export default function PlatformStatsCard() {
  const stats = useAdminDashboardPlatformStats();

  const items: StatItem[] = [
    {
      id: 'users',
      label: 'Platform users',
      value: stats.usersTotal,
      icon: TbUsers,
      tone: 'primary',
    },
    {
      id: 'teams',
      label: 'Teams',
      value: stats.teamsTotal,
      icon: TbBuilding,
      tone: 'info',
    },
    {
      id: 'sites',
      label: 'Sites (your scope)',
      value: stats.sitesTotal,
      hint: stats.sitesCapped ? 'Capped at 200 — not full platform total' : 'Admin-visible sites',
      icon: TbWorld,
      tone: 'success',
    },
    {
      id: 'connected',
      label: 'Connected sites',
      value: stats.connectedSites,
      hint: 'Bridge connected',
      icon: TbPlugConnected,
      tone: 'warning',
    },
  ];

  return (
    <ComponentCard title="Platform overview" className="admin-dashboard-card h-100 w-100" fillColumnHeight>
      {stats.isLoading ? (
        <div className="d-flex justify-content-center py-3">
          <Spinner animation="border" size="sm" variant="primary" />
        </div>
      ) : (
        <Row className="g-3">
          {items.map((item) => (
            <StatTile key={item.id} item={item} />
          ))}
        </Row>
      )}
      {stats.isError ? (
        <p className="text-danger small mb-0 mt-2">Some platform counts could not be loaded.</p>
      ) : null}
    </ComponentCard>
  );
}
