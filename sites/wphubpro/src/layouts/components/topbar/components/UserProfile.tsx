import { userDropdownItems } from '@/layouts/components/data'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useEffectiveIsAdmin } from '@/context/useEffectiveIsAdmin'
import { useAuth } from '@/domains/auth'

import { Link, useNavigate } from 'react-router'
import { Fragment } from 'react'
import { Dropdown, DropdownDivider, DropdownItem, DropdownMenu, DropdownToggle } from 'react-bootstrap'
import UserAvatar from '@/components/user/UserAvatar'
import { TbChevronDown } from 'react-icons/tb'
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
    <div className="topbar-item nav-user">
      <Dropdown align="end">
        <DropdownToggle as={'a'} className="topbar-link dropdown-toggle drop-arrow-none px-2">
          {user ? (
            <UserAvatar user={user} sizePx={32} className="rounded-circle me-lg-2 d-flex" />
          ) : (
            <span className="avatar-sm rounded-circle bg-secondary-subtle d-inline-block me-lg-2" style={{ width: 32, height: 32 }} />
          )}
          <div className="d-lg-flex align-items-center gap-1 d-none">
            <h5 className="my-0">{displayName}</h5>
            <TbChevronDown className="align-middle" />
          </div>
        </DropdownToggle>
        <DropdownMenu className="dropdown-menu-end topbar-user-dropdown topbar-dropdown-menu">
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
  )
}

export default UserProfile
