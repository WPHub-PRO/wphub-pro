import { usePlatformBranding } from '@/context/PlatformBrandingContext'
import { useLayoutContext } from '@/context/useLayoutContext'
import useScrollEvent from '@/hooks/useScrollEvent'
import clsx from 'clsx'
import CustomizerToggler from '@/layouts/components/topbar/components/CustomizerToggler'
import LanguageDropdown from '@/layouts/components/topbar/components/LanguageDropdown'
import MessageDropdown from '@/layouts/components/topbar/components/MessageDropdown'
import ThemeToggler from '@/layouts/components/topbar/components/ThemeToggler'
import ImpersonationExitButton from '@/layouts/components/topbar/components/ImpersonationExitButton'
import UserProfile from '@/layouts/components/topbar/components/UserProfile'
import {Link} from "react-router";
import { Container, FormControl } from 'react-bootstrap'
import { LuSearch } from 'react-icons/lu'
import { TbChevronLeft, TbChevronRight, TbMenu4 } from 'react-icons/tb'

import ApplicationMenu from '@/layouts/components/topbar/components/ApplicationMenu'
import FullscreenToggle from '@/layouts/components/topbar/components/FullscreenToggle'
import MonochromeThemeModeToggler from '@/layouts/components/topbar/components/MonochromeThemeModeToggler'
import WorkspaceSwitcher from '@/layouts/components/topbar/components/WorkspaceSwitcher'

const Topbar = () => {
  const { scrollY } = useScrollEvent()
  const { sidenav, changeSideNavSize, showBackdrop } = useLayoutContext()
  const branding = usePlatformBranding()

  const toggleSideNav = () => {
    const html = document.documentElement
    const currentSize = html.getAttribute('data-sidenav-size')

    if (currentSize === 'offcanvas') {
      html.classList.toggle('sidebar-enable')
      showBackdrop()
    } else if (sidenav.size === 'compact') {
      changeSideNavSize(currentSize === 'compact' ? 'condensed' : 'compact', false)
    } else {
      changeSideNavSize(currentSize === 'condensed' ? 'default' : 'condensed')
    }
  }

  return (
    <header className={clsx('app-topbar', { 'topbar-active': scrollY > 50 })}>
      <Container fluid className="topbar-menu">
        <div className="d-flex align-items-center gap-2">
          <div className="logo-topbar">
            <Link to="/" className="logo-light">
              <span className="logo-lg">
                <img src={branding.logoLightSrc} alt="" />
              </span>
              <span className="logo-sm">
                <img src={branding.iconLightSrc} alt="" />
              </span>
            </Link>

            <Link to="/" className="logo-dark">
              <span className="logo-lg">
                <img src={branding.logoDarkSrc} alt="" />
              </span>
              <span className="logo-sm">
                <img src={branding.iconDarkSrc} alt="" />
              </span>
            </Link>
          </div>

          <button
            type="button"
            onClick={toggleSideNav}
            className="sidenav-toggle-button btn btn-default btn-icon"
            aria-label={
              sidenav.size === 'offcanvas'
                ? 'Toggle menu'
                : sidenav.size === 'condensed'
                  ? 'Expand sidebar'
                  : 'Collapse sidebar'
            }
          >
            {sidenav.size === 'offcanvas' ? (
              <TbMenu4 className="fs-22" aria-hidden />
            ) : sidenav.size === 'condensed' ? (
              <TbChevronRight className="fs-22" aria-hidden />
            ) : (
              <TbChevronLeft className="fs-22" aria-hidden />
            )}
          </button>

          <WorkspaceSwitcher placement="topbar" />
        </div>

        <div className="d-flex align-items-center gap-2">
          <div className="app-search d-none d-xl-flex me-2">
            <FormControl type="search" className="topbar-search rounded-pill" name="search" placeholder="Quick Search..." />
            <LuSearch className="app-search-icon text-muted" />
          </div>

          <LanguageDropdown />

          <MessageDropdown />

          <ApplicationMenu />

          <ThemeToggler />

          <FullscreenToggle />

          <MonochromeThemeModeToggler />

          <ImpersonationExitButton />

          <UserProfile />

          <CustomizerToggler />
        </div>
      </Container>
    </header>
  )
}

export default Topbar
