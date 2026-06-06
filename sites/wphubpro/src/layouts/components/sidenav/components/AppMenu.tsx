

import { useDashboardNav } from '@/context/DashboardNavContext'
import { useEffectiveIsAdmin } from '@/context/useEffectiveIsAdmin'
import { useLayoutContext } from '@/context/useLayoutContext'
import {
  formatNotificationCountLabel,
  useNavMenuWithNotificationCount,
} from '@/domains/notifications/useNavMenuWithNotificationCount'
import { useMemberNavMenuWithTeamWorkspace } from '@/domains/workspace'
import { menuPathActive } from '@/helpers/menuPathActive'
import { scrollToElement } from '@/helpers/layout'
import { adminMenuItems, menuItems } from '@/layouts/components/data'
import type { MenuItemType } from '@/types/layout'
import { Link, useLocation } from 'react-router'
import { useEffect, useState } from 'react'
import { Collapse } from 'react-bootstrap'
import { TbChevronDown } from 'react-icons/tb'

function isChildBranchActive(
  children: MenuItemType[] | undefined,
  pathname: string,
): boolean {
  if (!children) return false
  return children.some(
    (child) =>
      (child.url && menuPathActive(child.url, pathname, child.urlMatch)) ||
      (child.children && isChildBranchActive(child.children, pathname)),
  )
}

function requestSidenavScrollbarRecalc() {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

/** If Collapse's node reports scrollHeight 0, measure the inner .sub-menu (theme CSS can force 0 on ul). */
function ensureSubMenuCollapseHeight(el: HTMLElement) {
  if (el.scrollHeight > 0) return
  const sub = el.querySelector<HTMLElement>('.sub-menu')
  if (sub && sub.scrollHeight > 0) {
    el.style.height = `${sub.scrollHeight}px`
  }
}

const MenuItemWithChildren = ({
  item,
  openMenuKey,
  setOpenMenuKey,
  level = 0,
}: {
  item: MenuItemType
  openMenuKey: string | null
  setOpenMenuKey: (key: string | null) => void
  level?: number
}) => {
  const {pathname} = useLocation()
  const isTopLevel = level === 0

  const [localOpen, setLocalOpen] = useState(false)
  const [didAutoOpen, setDidAutoOpen] = useState(false)

  const isChildActive = (children: MenuItemType[]): boolean => isChildBranchActive(children, pathname)

  const isActive = isChildActive(item.children || [])

  const isOpen = isTopLevel ? openMenuKey === item.key : localOpen

  // Nested submenus only: expand when route matches (top-level expand is owned by AppMenu).
  useEffect(() => {
    if (isTopLevel) return
    if (isActive && !didAutoOpen) {
      setLocalOpen(true)
      setDidAutoOpen(true)
    }
  }, [isActive, isTopLevel, didAutoOpen])

  const toggleOpen = () => {
    if (isTopLevel) {
      // While a child route is active, keep the section open (AppMenu also syncs from pathname).
      if (isActive) return
      setOpenMenuKey(isOpen ? null : item.key)
    } else {
      setLocalOpen((prev) => !prev)
    }
  }

  const itemClassName = `side-nav-item${isTopLevel ? '' : ' side-nav-item--nested'}${isOpen ? ' active' : ''}`

  return (
    <li className={itemClassName}>
      <button onClick={toggleOpen} className="side-nav-link" aria-expanded={isOpen}>
        {item.icon && (
          <span className="menu-icon">
            <item.icon />
          </span>
        )}
        <span className="menu-text">{item.label}</span>
        {item.badge ? (
          <span className={`badge bg-${item.badge.variant}`}>{item.badge.text}</span>
        ) : (
            <TbChevronDown className="menu-arrow" />
        )}
      </button>
      <Collapse
        in={isOpen}
        onEntering={ensureSubMenuCollapseHeight}
        onEntered={requestSidenavScrollbarRecalc}
        onExited={requestSidenavScrollbarRecalc}
      >
        <div className="side-nav-submenu-panel">
          <ul className="sub-menu">
            {(item.children || []).map((child) =>
              child.children ? (
                <MenuItemWithChildren key={child.key} item={child} openMenuKey={openMenuKey} setOpenMenuKey={setOpenMenuKey} level={level + 1} />
              ) : (
                <MenuItem key={child.key} item={child} nested />
              ),
            )}
          </ul>
        </div>
      </Collapse>
    </li>
  )
}

const MenuItem = ({ item, nested = false }: { item: MenuItemType; nested?: boolean }) => {
  const { pathname } = useLocation()
  const isActive = item.url ? menuPathActive(item.url, pathname, item.urlMatch) : false

  const { sidenav, hideBackdrop } = useLayoutContext()

  const toggleBackdrop = () => {
    if (sidenav.size === 'offcanvas') {
      hideBackdrop()
    }
  }

  const itemClassName = `side-nav-item${nested ? ' side-nav-item--nested' : ''}${isActive ? ' active' : ''}`

  return (
    <li className={itemClassName}>
      <Link
        to={item.url ?? '/'}
        onClick={toggleBackdrop}
        className={`side-nav-link  ${isActive ? 'active' : ''} ${item.isDisabled ? 'disabled' : ''} ${item.isSpecial ? 'special-menu' : ''}`}>
        {item.icon && (
          <span className="menu-icon">
            <item.icon />
          </span>
        )}
        <span className="menu-text">{item.label}</span>
        {item.countBadge != null && item.countBadge > 0 ? (
          <span className="sidenav-notif-count" aria-label={`${item.countBadge} unread notifications`}>
            {formatNotificationCountLabel(item.countBadge)}
          </span>
        ) : null}
        {item.badge && <span className={`badge text-bg-${item.badge.variant} opacity-50`}>{item.badge.text}</span>}
      </Link>
    </li>
  )
}

const AppMenu = () => {
  const { pathname } = useLocation()
  const { mode } = useDashboardNav()
  const effectiveAdmin = useEffectiveIsAdmin()
  const baseItems = effectiveAdmin ? adminMenuItems : menuItems
  const memberItems = useMemberNavMenuWithTeamWorkspace(baseItems)
  const items = useNavMenuWithNotificationCount(memberItems)
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null)

  // Keep the correct sidebar group open when the route is under a nested menu (e.g. Finance).
  // Synchronising here fixes submenus that collapsed after auth/menu tree mounted or on navigation.
  useEffect(() => {
    for (const item of items) {
      if (item.isTitle) continue
      if (item.children?.length && isChildBranchActive(item.children, pathname)) {
        setOpenMenuKey(item.key)
        return
      }
    }
    setOpenMenuKey(null)
  }, [items, pathname])

  const scrollToActiveLink = () => {
    const activeItem: HTMLAnchorElement | null = document.querySelector('.side-nav-link.active')
    if (activeItem) {
      const simpleBarContent = document.querySelector('#sidenav .simplebar-content-wrapper')
      if (simpleBarContent) {
        const offset = activeItem.offsetTop - window.innerHeight * 0.4
        scrollToElement(simpleBarContent, offset, 500)
      }
    }
  }

  useEffect(() => {
    setTimeout(() => scrollToActiveLink(), 100)
  }, [mode, pathname])

  return (
    <ul className="side-nav">
      {items.map((item) =>
        item.isTitle ? (
          <li className={'side-nav-title mt-2'} key={item.key}>
            {item.label}
          </li>
        ) : item.children ? (
          <MenuItemWithChildren key={item.key} item={item} openMenuKey={openMenuKey} setOpenMenuKey={setOpenMenuKey} />
        ) : (
          <MenuItem key={item.key} item={item} />
        ),
      )}
    </ul>
  )
}

export default AppMenu
