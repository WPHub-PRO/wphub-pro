/**
 * Shared TanStack `DataTable` wrapper. Icon-only action class strings are re-exported from
 * `./tableActionClasses` at the bottom of this file for convenient imports next to `DataTable`.
 */

import { isInteractiveTableRowClickTarget } from '@/lib/isInteractiveTableRowClickTarget'
import { flexRender, type Header, type Table as TableType } from '@tanstack/react-table'
import clsx from 'clsx'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Table } from 'react-bootstrap'
import { TbArrowDown, TbArrowUp } from 'react-icons/tb'

/** Optional `columnDef.meta` overrides for header alignment (TanStack Table). */
type DataTableColumnMeta = {
  /** Force header text alignment; `'start'` opts out of default actions-column `text-end`. */
  headerAlign?: 'start' | 'end'
}

function readDataTableColumnMeta(columnDef: { meta?: unknown }): DataTableColumnMeta | undefined {
  const m = columnDef.meta
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    return m as DataTableColumnMeta
  }
  return undefined
}

/**
 * Right-align the Actions column header: `id` / `accessorKey` `actions`, string header "Actions"
 * (case-insensitive), or `meta.headerAlign === 'end'`. Use `meta.headerAlign: 'start'` to opt out.
 */
export function isActionsStyleTableHeader<TData>(header: Header<TData, unknown>): boolean {
  const meta = readDataTableColumnMeta(header.column.columnDef)
  if (meta?.headerAlign === 'start') return false
  if (meta?.headerAlign === 'end') return true

  if (header.column.id === 'actions') return true

  const def = header.column.columnDef
  if ('accessorKey' in def) {
    const key = def.accessorKey
    if (typeof key === 'string' && key === 'actions') return true
  }

  const h = def.header
  if (typeof h === 'string' && h.trim().toLowerCase() === 'actions') return true

  return false
}

type DataTableProps<TData> = {
  /**
   * The table instance from useReactTable
   */
  table: TableType<TData>
  /**
   * When set, clicking a body row navigates or runs an action. Clicks on links, buttons,
   * form controls, or elements inside `[data-row-click-ignore]` do not trigger this.
   */
  onRowClick?: (row: TData) => void
  /** Optional extra class on each `<tr>` (e.g. highlight archived rows). */
  rowClassName?: (row: TData) => string | undefined
  /**
   * Optional class name for the table container (`table-responsive` wrapper)
   */
  className?: string
  /**
   * Adds `table-dashboard-rows` for consistent row height / vertical alignment (dashboard tables).
   */
  dashboardUniformRows?: boolean
  /**
   * Optional message to display when no data is available
   * @default 'Nothing found.'
   */
  emptyMessage?: ReactNode

  /**
   * Optional boolean to display headers
   * @default true
   */
  showHeaders?: boolean
}

const DataTable = <TData,>({
  table,
  className = '',
  emptyMessage = 'Nothing found.',
  showHeaders = true,
  dashboardUniformRows = false,
  onRowClick,
  rowClassName,
}: DataTableProps<TData>) => {
  const columns = table.getAllColumns()

  return (
    <div className={clsx('table-responsive', className)}>
      <Table
        hover
        className={clsx(
          'table table-custom table-centered table-nowrap mb-0 align-middle',
          'table-select w-100',
          dashboardUniformRows && 'table-dashboard-rows',
        )}
      >
        {showHeaders && (
          <thead className="bg-light align-middle bg-opacity-25 thead-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="text-uppercase fs-xxs">
                {headerGroup.headers.map((header) => {
                  const actionsHeader = isActionsStyleTableHeader(header)
                  return (
                    <th
                      key={header.id}
                      className={clsx(actionsHeader && 'text-end')}
                      onClick={header.column.getToggleSortingHandler()}
                      style={{
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                        userSelect: 'none',
                      }}>
                      <div
                        className={clsx(
                          'd-flex align-items-center',
                          actionsHeader && 'justify-content-end',
                        )}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() &&
                          ({
                            asc: <TbArrowUp className="ms-1" />,
                            desc: <TbArrowDown className="ms-1" />,
                          }[header.column.getIsSorted() as string] ??
                            null)}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
        )}
        <tbody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const handleRowClick = (e: MouseEvent<HTMLTableRowElement>) => {
                if (!onRowClick) return
                if (isInteractiveTableRowClickTarget(e.target)) return
                onRowClick(row.original)
              }

              const handleRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
                if (!onRowClick) return
                if (e.key !== 'Enter' && e.key !== ' ') return
                if (isInteractiveTableRowClickTarget(e.target)) return
                e.preventDefault()
                onRowClick(row.original)
              }

              return (
                <tr
                  key={row.id}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={clsx(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                  onClick={handleRowClick}
                  onKeyDown={handleRowKeyDown}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={columns.length} className="text-center py-3 text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  )
}

export default DataTable

export {
  TABLE_ACTION_GROUP_CLASS,
  TABLE_ACTION_ICON_DANGER_CLASS,
  TABLE_ACTION_ICON_LIGHT_CLASS,
  TABLE_ACTION_ICON_MUTED_CLASS,
  TABLE_ACTION_ICON_OUTLINE_PRIMARY_CLASS,
  TABLE_ACTION_ICON_OUTLINE_SECONDARY_CLASS,
  TABLE_ACTION_ICON_SOFT_SUCCESS_CLASS,
} from './tableActionClasses'
