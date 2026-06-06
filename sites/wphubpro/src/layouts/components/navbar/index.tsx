import AppMenu from '@/layouts/components/navbar/components/AppMenu'
import WorkspaceSwitcher from '@/layouts/components/topbar/components/WorkspaceSwitcher'

const Navbar = () => {
  return (
    <header className="topnav">
      <nav className="navbar navbar-expand-lg">
        <nav className="container-fluid d-flex flex-wrap align-items-center gap-2">
          <WorkspaceSwitcher placement="topnav" />
          <div className="flex-grow-1 min-w-0">
            <AppMenu />
          </div>
        </nav>
      </nav>
    </header>
  )
}

export default Navbar
