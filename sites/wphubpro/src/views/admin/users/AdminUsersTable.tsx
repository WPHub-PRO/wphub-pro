import UserAvatar from '@/components/user/UserAvatar';
import { TABLE_ACTION_GROUP_CLASS, TABLE_ACTION_ICON_MUTED_CLASS } from '@/components/table/tableActionClasses';
import type { AdminUser } from '@/domains/admin/useAdminUsers';
import { Table } from 'react-bootstrap';
import { TbPencil, TbUserShare } from 'react-icons/tb';

type AdminUsersTableProps = {
  users: AdminUser[];
  onEdit: (user: AdminUser) => void;
  onImpersonate: (userId: string) => void;
  impersonateBusyId: string | null;
};

const AdminUsersTable = ({
  users,
  onEdit,
  onImpersonate,
  impersonateBusyId,
}: AdminUsersTableProps) => {
  return (
    <div className="table-responsive border rounded">
      <Table hover className="table table-custom table-centered table-nowrap mb-0 align-middle">
        <thead className="bg-light align-middle bg-opacity-25 thead-sm">
          <tr className="text-uppercase fs-xxs">
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Joined</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const roleVariant = user.role === 'Admin' ? 'primary' : 'secondary';
            const statusVariant = user.status === 'Active' ? 'success' : 'warning';
            return (
              <tr key={user.id}>
                <td>
                  <div className="d-flex align-items-center gap-2">
                    <UserAvatar
                      user={{
                        $id: user.id,
                        prefs: user.prefs,
                        name: user.name,
                        email: user.email,
                        legacyAccountAvatarUrl: user.accountAvatar,
                      }}
                      sizePx={36}
                      className="rounded-circle flex-shrink-0"
                    />
                    <span className="fw-medium text-truncate" style={{ maxWidth: '12rem' }} title={user.name}>
                      {user.name}
                    </span>
                  </div>
                </td>
                <td>
                  <span className="text-muted fs-xs text-truncate d-inline-block" style={{ maxWidth: '14rem' }} title={user.email}>
                    {user.email}
                  </span>
                </td>
                <td>
                  <span className={`badge bg-${roleVariant}-subtle text-${roleVariant}`}>{user.role}</span>
                </td>
                <td className="fs-xs text-muted">{user.planName}</td>
                <td>
                  <span className={`badge bg-${statusVariant}-subtle text-${statusVariant}`}>{user.status}</span>
                </td>
                <td className="text-muted fs-xs text-nowrap">{user.joined}</td>
                <td className="text-end">
                  <div className={TABLE_ACTION_GROUP_CLASS}>
                    <button
                      type="button"
                      className={TABLE_ACTION_ICON_MUTED_CLASS}
                      aria-label="Log in as user"
                      title="Log in as user"
                      disabled={impersonateBusyId !== null}
                      onClick={() => onImpersonate(user.id)}
                    >
                      {impersonateBusyId === user.id ? (
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden />
                      ) : (
                        <TbUserShare className="fs-lg" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={TABLE_ACTION_ICON_MUTED_CLASS}
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => onEdit(user)}
                    >
                      <TbPencil className="fs-lg" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};

export default AdminUsersTable;
