import { Card, CardBody, CardHeader, CardTitle } from 'react-bootstrap';
import { MdFlashOff, MdFlashOn } from 'react-icons/md';
import { TbCreditCard, TbFolders, TbUsers } from 'react-icons/tb';

type TeamDetailsSidebarCardProps = {
  teamId: string;
  teamName: string;
  memberCount: number;
  seatsUsed: number;
  seatTotal: number | null;
  isOwner: boolean;
  isMemberOnly: boolean;
  hasBilling: boolean;
};

const TeamDetailsSidebarCard = ({
  teamId,
  teamName,
  memberCount,
  seatsUsed,
  seatTotal,
  isOwner,
  isMemberOnly,
  hasBilling,
}: TeamDetailsSidebarCardProps) => {
  const statusLabel = hasBilling ? 'Billing active' : 'Billing pending';
  const roleLabel = isOwner ? 'Owner workspace' : isMemberOnly ? 'Member workspace' : 'Shared workspace';
  const seatLabel = seatTotal != null && seatTotal > 0 ? `${seatsUsed} / ${seatTotal}` : `${seatsUsed} used`;

  return (
    <div className="position-sticky align-self-start z-3" style={{ top: '0.75rem' }}>
      <Card className="bg-dark text-white border-secondary border-opacity-25 shadow">
        <CardHeader className="d-flex flex-wrap align-items-start justify-content-between gap-2 border-secondary border-opacity-25 bg-transparent text-white">
          <CardTitle as="h4" className="mb-0 text-white">
            Team details
          </CardTitle>
          <div className="d-flex flex-column align-items-end text-end flex-shrink-0 ms-auto">
            <div className="d-flex align-items-center gap-1 flex-wrap justify-content-end">
              {hasBilling ? (
                <MdFlashOn style={{ fontSize: '1.35rem', color: '#22c55e' }} aria-hidden />
              ) : (
                <MdFlashOff style={{ fontSize: '1.35rem', color: 'rgba(255,255,255,0.45)' }} aria-hidden />
              )}
              <span className="fs-xs text-white fw-medium">{statusLabel}</span>
            </div>
          </div>
        </CardHeader>
        <CardBody className="pt-0">
          <div className="d-flex align-items-center mb-4">
            <div className="me-2 flex-shrink-0">
              <span
                className="rounded-circle bg-white d-inline-flex align-items-center justify-content-center flex-shrink-0 shadow-sm overflow-hidden"
                style={{ width: 48, height: 48, lineHeight: 0 }}
                aria-hidden
              >
                <TbFolders className="text-dark" style={{ fontSize: '1.5rem' }} />
              </span>
            </div>
            <div className="min-w-0 flex-grow-1">
              <h5 className="mb-1 text-truncate text-white" title={teamName}>
                {teamName}
              </h5>
              <p className="text-white-50 mb-0 fs-xs text-break">Team ID · {teamId}</p>
            </div>
          </div>

          <ul className="list-unstyled text-white-50 mb-0">
            <li className="mb-3">
              <div className="d-flex align-items-start gap-2">
                <div className="avatar-xs avatar-img-size fs-24 flex-shrink-0">
                  <span className="avatar-title bg-white bg-opacity-10 text-white fs-sm rounded-circle d-inline-flex align-items-center justify-content-center border border-white border-opacity-10">
                    <TbUsers />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="fs-xxs text-uppercase text-white-50 mb-0 fw-semibold">Members</p>
                  <span className="link-light fw-medium text-break d-block">{memberCount}</span>
                </div>
              </div>
            </li>
            <li className="mb-0">
              <div className="d-flex align-items-start gap-2">
                <div className="avatar-xs avatar-img-size fs-24 flex-shrink-0">
                  <span className="avatar-title bg-white bg-opacity-10 text-white fs-sm rounded-circle d-inline-flex align-items-center justify-content-center border border-white border-opacity-10">
                    <TbCreditCard />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="fs-xxs text-uppercase text-white-50 mb-0 fw-semibold">Seats</p>
                  <span className="link-light fw-medium text-break d-block">{seatLabel}</span>
                </div>
              </div>
            </li>
          </ul>

          <hr className="my-3 border-secondary border-opacity-50" />

          <div className="d-flex flex-wrap gap-2 mb-3">
            <span className={`badge ${isOwner ? 'badge-soft-warning' : 'badge-soft-light'} badge-label text-dark`}>
              {roleLabel}
            </span>
            {isMemberOnly ? (
              <span className="badge badge-soft-light badge-label text-dark">Members only</span>
            ) : null}
          </div>

          <div className="rounded bg-white bg-opacity-10 border border-white border-opacity-10 p-3">
            <p className="fs-xxs text-uppercase text-white-50 fw-semibold mb-1">Workspace access</p>
            <p className="mb-0 small text-white fw-medium">
              {isOwner ? 'You can manage billing, invites, and ownership.' : 'You can view shared team details and your membership.'}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default TeamDetailsSidebarCard;
