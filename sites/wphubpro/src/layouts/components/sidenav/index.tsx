
import { usePlatformBranding } from '@/context/PlatformBrandingContext'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useLayoutContext } from '@/context/useLayoutContext'
import { isSidebarCollapsedForChrome } from '@/helpers/sidebarLayout'
import AppMenu from '@/layouts/components/sidenav/components/AppMenu'
import SidenavBridgeDownload from '@/layouts/components/sidenav/components/SidenavBridgeDownload'
import UserProfile from '@/layouts/components/sidenav/components/UserProfile'

import { Link, NavLink } from 'react-router'
import { TbBook, TbChevronLeft, TbChevronRight, TbX } from 'react-icons/tb'
import SimpleBar from "simplebar-react";

const Sidenav = () => {
  const { sidenav, hideBackdrop, changeSideNavSize } = useLayoutContext()
  const sidebarCollapsed = isSidebarCollapsedForChrome(sidenav.size)
  const branding = usePlatformBranding()

  const toggleSidebar = () => {
    changeSideNavSize(sidenav.size === 'on-hover-active' ? 'on-hover' : 'on-hover-active')
  }

  const closeSidebar = () => {
    const html = document.documentElement
    html.classList.toggle('sidebar-enable')
    hideBackdrop()
  }

  return (
    <div className="sidenav-menu" id="sidenav">
      <Link to="/" className="logo">
        <span className="logo logo-light">
          <span className="logo-lg">
            <img src={branding.logoLightSrc} alt="" />
          </span>
          <span className="logo-sm">
            <img src={branding.iconLightSrc} alt="" />
          </span>
        </span>

        <span className="logo logo-dark">
          <span className="logo-lg">
            <img src={branding.logoDarkSrc} alt="" />
          </span>
          <span className="logo-sm">
            <img src={branding.iconDarkSrc} alt="" />
          </span>
        </span>
      </Link>

      <button type="button" className="button-on-hover" onClick={toggleSidebar} aria-label={sidenav.size === 'on-hover-active' ? 'Collapse sidebar' : 'Expand sidebar'}>
        {sidenav.size === 'on-hover-active' ? (
          <TbChevronLeft className="fs-22 align-middle" aria-hidden />
        ) : (
          <TbChevronRight className="fs-22 align-middle" aria-hidden />
        )}
      </button>

      <button className="button-close-offcanvas">
        <TbX onClick={closeSidebar} className="align-middle" />
      </button>

      <SimpleBar className="scrollbar">
        {sidenav.user && <UserProfile />}
        <div id="sidenav-menu">
          <AppMenu />
        </div>
        <div className="sidenav-footer mt-auto pb-3 pt-1">
          <div className="sidenav-footer-inner pt-2">
            <NavLink
              to={ROUTE_PATHS.DOCS}
              onClick={() => {
                if (sidenav.size === 'offcanvas') hideBackdrop()
              }}
              className={({ isActive }) => `sidenav-footer-help${isActive ? ' active' : ''}`}
            >
              <span className="sidenav-footer-help__icon" aria-hidden>
                <TbBook />
              </span>
              <span className="menu-text">Help &amp; docs</span>
            </NavLink>
          </div>
          <SidenavBridgeDownload sidebarCollapsed={sidebarCollapsed} />
        </div>
      </SimpleBar>
    </div>
  )
}

export default Sidenav
