import UserAvatar from '@/components/user/UserAvatar';
import type { AdminUser } from '@/domains/admin/useAdminUsers';
import { Card, CardBody } from 'react-bootstrap';
import { TbMail, TbPencil, TbShieldCheck, TbUserCheck, TbUserShare } from 'react-icons/tb';

type AdminUserCardProps = {
  user: AdminUser;
  onEdit: (user: AdminUser) => void;
  onImpersonate: (userId: string) => void;
  impersonateBusyId: string | null;
};

const AdminUserCard = ({ user, onEdit, onImpersonate, impersonateBusyId }: AdminUserCardProps) => {
  const roleVariant = user.role === 'Admin' ? 'primary' : 'secondary';
  const statusVariant = user.status === 'Active' ? 'success' : 'warning';

  return (
    <Card className="h-100">
      <CardBody className="text-center">
        <div className="position-relative">
          <div className="position-absolute top-0 end-0 d-flex align-items-center gap-1 p-1">
            <button
              type="button"
              className="btn btn-default btn-icon btn-sm text-muted"
              aria-label="Log in as user"
              title="Log in as user"
              disabled={impersonateBusyId !== null}
              onClick={() => onImpersonate(user.id)}
            >
              {impersonateBusyId === user.id ? (
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
              ) : (
                <TbUserShare className="fs-xl" />
              )}
            </button>
            <button
              type="button"
              className="btn btn-default btn-icon btn-sm text-muted"
              aria-label="Edit"
              title="Edit"
              onClick={() => onEdit(user)}
            >
              <TbPencil className="fs-xl" aria-hidden />
            </button>
          </div>
        </div>

        <UserAvatar
          user={{
            $id: user.id,
            prefs: user.prefs,
            name: user.name,
            email: user.email,
            legacyAccountAvatarUrl: user.accountAvatar,
          }}
          sizePx={72}
          className="rounded-circle mx-auto"
        />

        <h5 className="mb-0 mt-2 text-truncate px-1" title={user.name}>
          {user.name}
        </h5>
        <span className="text-muted fs-xs d-block text-truncate px-2" title={user.email}>
          {user.email}
        </span>
        <div className="d-flex flex-wrap gap-1 justify-content-center mt-2">
          <span className={`badge bg-${roleVariant}-subtle text-${roleVariant}`}>{user.role}</span>
          <span className={`badge bg-${statusVariant}-subtle text-${statusVariant}`}>{user.status}</span>
        </div>
        <span className="text-muted fs-xs d-block mt-2">
          <TbMail className="align-middle me-1 opacity-75" />
          {user.planName}
        </span>

        <hr className="my-3 border-dashed" />

        <div className="d-flex justify-content-between text-center small">
          <div className="flex-fill px-1">
            <div className="fw-semibold d-flex align-items-center justify-content-center gap-1">
              <TbShieldCheck className="text-muted opacity-75" />
              {user.role}
            </div>
            <span className="text-muted fs-xs">Role</span>
          </div>
          <div className="flex-fill px-1 border-start border-light">
            <div className="fw-semibold">{user.planName}</div>
            <span className="text-muted fs-xs">Plan</span>
          </div>
          <div className="flex-fill px-1 border-start border-light">
            <div className="fw-semibold d-flex align-items-center justify-content-center gap-1">
              <TbUserCheck className="text-muted opacity-75" />
              {user.status === 'Active' ? 'On' : 'Off'}
            </div>
            <span className="text-muted fs-xs">Status</span>
          </div>
        </div>

        <hr className="mt-3 mb-0 border-dashed" />
        <div className="text-muted fs-xs pt-2">Member since {user.joined}</div>
      </CardBody>
    </Card>
  );
};

export default AdminUserCard;
