
import { useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, Collapse } from 'react-bootstrap'

/** Collapse must animate a block wrapper; measuring `card-body` alone often returns 0 in flex / after toggle. */
function ensureCollapseHeightFromContent(node: HTMLElement) {
  if (node.scrollHeight > 0) return
  const inner = node.firstElementChild as HTMLElement | null
  if (inner && inner.scrollHeight > 0) {
    node.style.height = `${inner.scrollHeight}px`
  }
}

function requestLayoutRecalc() {
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'))
  })
}
import { TbChevronDown, TbRefresh, TbX } from 'react-icons/tb'

import type { ChildrenType } from '@/types'
import clsx from 'clsx'
import type { ReactNode } from 'react'

type ComponentCardProps = {
    title: string
    /** Shown inline next to the title (e.g. total count badge). */
    titleExtra?: ReactNode
    /** Extra controls in the header row (right side, with collapsible/refresh/close when set). */
    headerActions?: ReactNode
    /**
     * Stretch to parent height (use inside a `d-flex` column) so sibling cards match the tallest.
     * Adds `h-100 d-flex flex-column` on the card and grows the body to fill remaining space.
     */
    fillColumnHeight?: boolean
    isCollapsible?: boolean
    isRefreshable?: boolean
    isCloseable?: boolean
    className?: string
    bodyClassName?: string
    headerClassName?: string
} & ChildrenType

const ComponentCard = ({
    title,
    titleExtra,
    headerActions,
    fillColumnHeight,
    isCloseable,
    isCollapsible,
    isRefreshable,
    className,
    bodyClassName,
    children,
    headerClassName,
}: ComponentCardProps) => {
    const [isVisible, setIsVisible] = useState(true)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)

    const handleClose = () => {
        setIsVisible(false)
    }

    const handleToggle = () => {
        setIsCollapsed(!isCollapsed)
    }

    // Simulate a refresh action
    // In a real-world scenario, you would fetch new data here
    const handleRefresh = () => {
        console.log('Refreshing...')
        setIsRefreshing(true)
        setTimeout(() => {
            setIsRefreshing(false)
        }, 1500)
    }

    if (!isVisible) return null

    return (
        <Card
            className={clsx(
                isCollapsed && 'card-collapse',
                fillColumnHeight && 'h-100 w-100 d-flex flex-column',
                className,
            )}
        >
            {isRefreshing && (
                <div className="card-overlay d-flex" >
                    <div className="spinner-border text-primary" />
                </div>
            )}

            <CardHeader
                className={clsx(
                    'justify-content-between align-items-center',
                    fillColumnHeight && 'flex-shrink-0',
                    headerClassName,
                )}
            >
                <CardTitle as="div" className="d-flex align-items-center gap-2 flex-wrap mb-0">
                    <span>{title}</span>
                    {titleExtra}
                </CardTitle>
                <div className="card-action">
                    {isCollapsible && (
                        <span className="card-action-item cursor-pointer" onClick={handleToggle}>
                            <TbChevronDown style={{ rotate: isCollapsed ? '0deg' : '180deg' }} />
                        </span>
                    )}
                    {isRefreshable && (
                        <span className="card-action-item cursor-pointer" onClick={handleRefresh}>
                            <TbRefresh />
                        </span>
                    )}
                    {isCloseable && (
                        <span className="card-action-item cursor-pointer" onClick={handleClose}>
                            <TbX />
                        </span>
                    )}
                    {headerActions ? (
                        <div className="d-flex align-items-center gap-2 flex-shrink-0">{headerActions}</div>
                    ) : null}
                </div>
            </CardHeader>

            {isCollapsible ? (
                <Collapse
                    in={!isCollapsed}
                    onEntering={ensureCollapseHeightFromContent}
                    onEntered={requestLayoutRecalc}
                    onExited={requestLayoutRecalc}
                >
                    <div className={clsx('w-100', fillColumnHeight && 'd-flex flex-column flex-grow-1 min-h-0')}>
                        <CardBody
                            className={clsx(
                                fillColumnHeight && 'd-flex flex-column flex-grow-1 min-h-0',
                                bodyClassName,
                            )}
                        >
                            {children}
                        </CardBody>
                    </div>
                </Collapse>
            ) : (
                <CardBody className={clsx(fillColumnHeight && 'd-flex flex-column flex-grow-1 min-h-0', bodyClassName)}>
                    {children}
                </CardBody>
            )}
        </Card>
    )
}

export default ComponentCard
