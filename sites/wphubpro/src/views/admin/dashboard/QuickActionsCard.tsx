import ComponentCard from '@/components/cards/ComponentCard';
import { ROUTE_PATHS } from '@/config/routePaths';
import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router';
import {
  TbLifebuoy,
  TbMail,
  TbSettings,
  TbUserPlus,
  TbUsers,
  TbWorld,
} from 'react-icons/tb';

type Action = {
  label: string;
  description: string;
  to: string;
  icon: typeof TbUsers;
  variant: string;
};

const ACTIONS: Action[] = [
  {
    label: 'Users',
    description: 'Browse and edit accounts',
    to: ROUTE_PATHS.ADMIN_USERS,
    icon: TbUsers,
    variant: 'primary',
  },
  {
    label: 'Support queue',
    description: 'Helpdesk tickets',
    to: ROUTE_PATHS.ADMIN_SUPPORT,
    icon: TbLifebuoy,
    variant: 'info',
  },
  {
    label: 'Platform settings',
    description: 'Branding, API, inbox',
    to: ROUTE_PATHS.ADMIN_SETTINGS,
    icon: TbSettings,
    variant: 'secondary',
  },
  {
    label: 'Compose email',
    description: 'Platform workspace inbox',
    to: ROUTE_PATHS.INBOX_COMPOSE,
    icon: TbMail,
    variant: 'danger',
  },
  {
    label: 'Sites',
    description: 'Your connected WordPress sites',
    to: ROUTE_PATHS.SITES,
    icon: TbWorld,
    variant: 'success',
  },
  {
    label: 'Teams',
    description: 'Team workspaces',
    to: ROUTE_PATHS.ADMIN_TEAMS,
    icon: TbUserPlus,
    variant: 'warning',
  },
];

export default function QuickActionsCard() {
  return (
    <ComponentCard
      title="Quick actions"
      className="admin-dashboard-card h-100 w-100"
      fillColumnHeight
      bodyClassName="admin-dashboard-card-body admin-dashboard-scroll"
    >
      <Row className="g-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Col key={action.label} xs={6} md={4} xl={4}>
              <Button
                as={Link}
                to={action.to}
                variant={`outline-${action.variant}`}
                className="w-100 text-start admin-dashboard-quick-action"
              >
                <span className={`avatar-title bg-${action.variant}-subtle text-${action.variant} rounded-circle d-inline-flex p-2 me-2`}>
                  <Icon />
                </span>
                <span>
                  <span className="d-block fw-semibold">{action.label}</span>
                  <span className="d-block small text-muted fw-normal">{action.description}</span>
                </span>
              </Button>
            </Col>
          );
        })}
      </Row>
    </ComponentCard>
  );
}
