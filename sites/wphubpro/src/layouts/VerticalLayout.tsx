import Customizer from '@/layouts/components/customizer'
import Footer from '@/layouts/components/footer'
import Sidenav from '@/layouts/components/sidenav'
import Topbar from '@/layouts/components/topbar'
import type { ChildrenType } from '@/types'
import { Fragment } from 'react'
import { Container } from 'react-bootstrap'

const VerticalLayout = ({ children }: ChildrenType) => {
  return (
    <Fragment>
      <div className="wrapper">
        <Sidenav />
        <Topbar />
        <div className="content-page">
          <Container fluid>{children}</Container>
          <Footer />
        </div>
      </div>
      <Customizer />
    </Fragment>
  )
}

export default VerticalLayout
