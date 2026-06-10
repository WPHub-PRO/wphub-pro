import ComponentCard from '@/components/cards/ComponentCard';
import { ROUTE_PATHS } from '@/config/routePaths';
import { ListGroup } from 'react-bootstrap';
import { Link } from 'react-router';
import {
  TbBell,
  TbBook,
  TbCoin,
  TbMail,
  TbPackages,
  TbSettings,
} from 'react-icons/tb';

type ToolLink = {
  label: string;
  description: string;
  to: string;
  icon: typeof TbBell;
};

const TOOLS: ToolLink[] = [
  {
    label: 'Platform events',
    description: 'Broadcasts and notification routing',
    to: ROUTE_PATHS.ADMIN_COMMUNICATION_PLATFORM_EVENTS,
    icon: TbBell,
  },
  {
    label: 'System e-mails',
    description: 'Transactional templates and delivery',
    to: ROUTE_PATHS.ADMIN_COMMUNICATION_SYSTEM_EMAILS,
    icon: TbMail,
  },
  {
    label: 'Finance · Plans',
    description: 'Stripe catalog products',
    to: ROUTE_PATHS.ADMIN_FINANCE_PLANS,
    icon: TbPackages,
  },
  {
    label: 'Finance · Subscriptions',
    description: 'Active and past subscriptions',
    to: ROUTE_PATHS.ADMIN_FINANCE_SUBSCRIPTIONS,
    icon: TbCoin,
  },
  {
    label: 'Docs manager',
    description: 'Knowledge base articles',
    to: ROUTE_PATHS.ADMIN_DOCS,
    icon: TbBook,
  },
  {
    label: 'Platform settings',
    description: 'API keys, branding, workspace inbox',
    to: ROUTE_PATHS.ADMIN_SETTINGS,
    icon: TbSettings,
  },
];

export default function ToolsCard() {
  return (
    <ComponentCard
      title="Admin tools"
      className="admin-dashboard-card h-100 w-100"
      fillColumnHeight
      bodyClassName="admin-dashboard-card-body d-flex flex-column min-h-0 pt-2"
    >
      <ListGroup variant="flush" className="admin-dashboard-tools-list admin-dashboard-scroll flex-grow-1 mb-0">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <ListGroup.Item
              key={tool.to}
              action
              as={Link}
              to={tool.to}
              className="px-0 d-flex align-items-center gap-2 border-0 border-bottom"
            >
              <span className="avatar-title bg-light text-body rounded-circle d-inline-flex p-2">
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="d-block fw-medium">{tool.label}</span>
                <span className="d-block small text-muted">{tool.description}</span>
              </span>
            </ListGroup.Item>
          );
        })}
      </ListGroup>
    </ComponentCard>
  );
}
