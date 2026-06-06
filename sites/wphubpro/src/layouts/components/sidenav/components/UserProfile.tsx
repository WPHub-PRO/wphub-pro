import { userDropdownItems } from '@/layouts/components/data'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useEffectiveIsAdmin } from '@/context/useEffectiveIsAdmin'
import { useAuth } from '@/domains/auth'
import { Link, useNavigate } from 'react-router'
import { Fragment } from 'react'
import { Dropdown, DropdownDivider, DropdownItem, DropdownMenu, DropdownToggle } from 'react-bootstrap'
import UserAvatar from '@/components/user/UserAvatar'
import { TbSettings } from 'react-icons/tb'
import clsx from 'clsx'

const UserProfile = () => {
  const { logout, user } = useAuth()
  const effectiveAdmin = useEffectiveIsAdmin()
  const navigate = useNavigate()

  const displayName = user?.name?.trim() || user?.email || 'Account'

  const handleLogout = async () => {
    await logout()
    navigate(ROUTE_PATHS.LOGIN, { replace: true })
  }

  return (
    <div className="sidenav-user">
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <Link to={ROUTE_PATHS.PROFILE} className="link-reset">
            {user ? (
              <UserAvatar user={user} sizePx={36} className="rounded-circle mb-2 avatar-md" />
            ) : null}
            <span className="sidenav-user-name fw-bold">{displayName}</span>
            <span className="fs-12 fw-semibold" data-lang="user-role">
              {effectiveAdmin ? 'Administrator' : 'Member'}
            </span>
          </Link>
        </div>
        <Dropdown>
          <DropdownToggle
            as={'a'}
            role="button"
            aria-label="profile dropdown"
            className="dropdown-toggle drop-arrow-none link-reset sidenav-user-set-icon">
            <TbSettings className="fs-24 align-middle ms-1" />
          </DropdownToggle>

          <DropdownMenu>
            {userDropdownItems
              .filter((item) => !item.adminOnly || effectiveAdmin)
              .map((item, idx) => (
              <Fragment key={idx}>
                {item.isHeader ? (
                  <div className="dropdown-header noti-title">
                    <h6 className="text-overflow m-0">{item.label}</h6>
                  </div>
                ) : item.isDivider ? (
                  <DropdownDivider />
                ) : item.isLogout ? (
                  <DropdownItem
                    as="button"
                    type="button"
                    className={clsx(item.class, 'd-flex align-items-center gap-2 text-start flex-nowrap')}
                    onClick={() => void handleLogout()}>
                    {item.icon ? <item.icon className="fs-17 flex-shrink-0" aria-hidden /> : null}
                    <span className="text-truncate min-w-0">{item.label}</span>
                  </DropdownItem>
                ) : (
                  <DropdownItem
                    as={Link}
                    to={item.url ?? ''}
                    className={clsx(item.class, 'd-flex align-items-center gap-2 text-start flex-nowrap')}>
                    {item.icon ? <item.icon className="fs-17 flex-shrink-0" aria-hidden /> : null}
                    <span className="text-truncate min-w-0">{item.label}</span>
                  </DropdownItem>
                )}
              </Fragment>
            ))}
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  )
}

export default UserProfile
