import Customizer from '@/layouts/components/customizer'
import Footer from '@/layouts/components/footer'
import Topbar from '@/layouts/components/topbar'
import ResponsiveNavbar from '@/layouts/components/responsive-navbar'
import type { ChildrenType } from '@/types'
import { Fragment } from 'react'
import { Container } from 'react-bootstrap'

const HorizontalLayout = ({ children }: ChildrenType) => {
  return (
    <Fragment>
      <div className="wrapper">
        <Topbar />
        <ResponsiveNavbar />
        <div className="content-page">
          <Container fluid>{children}</Container>
          <Footer />
        </div>
      </div>
      <Customizer />
    </Fragment>
  )
}

export default HorizontalLayout
