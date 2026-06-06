import PageBreadcrumb from '@/components/PageBreadcrumb';
import PageMetaData from '@/components/PageMetaData';
import { ROUTE_PATHS } from '@/config/routePaths';
import { useAuth } from '@/domains/auth';
import { useTeamWorkspaceWithActiveSync } from '@/domains/workspace';
import MailboxSettingsForm from '@/views/mailbox/MailboxSettingsForm';
import { Alert, Container, Spinner } from 'react-bootstrap';
import { Link, useParams } from 'react-router';

export default function TeamSettingsPage() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const teamId = teamIdParam?.trim() ?? '';
  const { user } = useAuth();
  const teamQ = useTeamWorkspaceWithActiveSync(teamId || null);
  const data = teamQ.data;
  const isMemberOnly = data?.accountKind === 'team_member';
  const isOwner = Boolean(data?.isOwner);
  const canEditMail = Boolean(isOwner && !isMemberOnly);

  if (!user) return null;

  if (!teamId) {
    return (
      <Container fluid>
        <Alert variant="danger">Missing team id.</Alert>
      </Container>
    );
  }

  return (
    <>
      <PageMetaData title={data?.team?.name ? `${data.team.name} · Settings` : 'Team settings'} />
      <PageBreadcrumb
        title={data?.team?.name ? `${data.team.name} · Settings` : 'Team settings'}
        subtitle="Workspace email (IMAP / SMTP)"
        titleEnd={
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <Link to={ROUTE_PATHS.teamPath(teamId)} className="btn btn-outline-secondary btn-sm">
              Your team
            </Link>
            <Link to={ROUTE_PATHS.TEAMS} className="btn btn-outline-secondary btn-sm">
              All teams
            </Link>
          </div>
        }
      />
      <Container fluid>
        {teamQ.isLoading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" role="status" variant="primary" />
          </div>
        ) : !data?.team ? (
          <Alert variant="warning">You do not have access to this team.</Alert>
        ) : (
          <>
            <Alert variant="light" className="border mb-3">
              Shared mailbox for this team. All members can read and send from Inbox when this team workspace is active.
              Only owners can change these settings.
            </Alert>
            <MailboxSettingsForm variant="team" teamId={teamId} canEdit={canEditMail} />
          </>
        )}
      </Container>
    </>
  );
}
