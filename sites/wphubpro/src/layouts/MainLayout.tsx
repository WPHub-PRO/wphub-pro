import Loader from '@/components/Loader'
import { AdminPlatformMailboxProvider } from '@/context/AdminPlatformMailboxContext'
import { DashboardNavProvider } from '@/context/DashboardNavContext'
import {useLayoutContext} from '@/context/useLayoutContext'
import { useSites, useSitesPagespeedSessionBootstrap } from '@/domains/sites'
import HorizontalLayout from '@/layouts/HorizontalLayout'
import VerticalLayout from '@/layouts/VerticalLayout'
import {Fragment, useEffect, useState} from 'react'
import {Outlet} from "react-router";

const MainLayout = () => {
    const {orientation} = useLayoutContext()
    const { data: sites } = useSites()
    useSitesPagespeedSessionBootstrap(sites)

    const [hasMounted, setHasMounted] = useState(false)

    useEffect(() => {
        setHasMounted(true)
    }, [])

    if (!hasMounted) return <Loader height="100vh"/>

    return (
        <DashboardNavProvider>
            <AdminPlatformMailboxProvider>
                <div className="app-viewport">
                    <Fragment>
                        {orientation === 'vertical' && <VerticalLayout> <Outlet/></VerticalLayout>}
                        {orientation === 'horizontal' && <HorizontalLayout> <Outlet/></HorizontalLayout>}
                    </Fragment>
                </div>
            </AdminPlatformMailboxProvider>
        </DashboardNavProvider>
    )
}

export default MainLayout
