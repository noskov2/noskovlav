import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => number | string
  align?: 'left' | 'right' | 'center'
  className?: string
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  searchable?: boolean
  searchPredicate?: (row: T, query: string) => boolean
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  emptyMessage?: string
  pageSize?: number
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchable,
  searchPredicate,
  defaultSortKey,
  defaultSortDir = 'desc',
  emptyMessage = 'Nu există date pentru filtrele selectate.',
  pageSize = 25,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    if (!query.trim() || !searchPredicate) return rows
    return rows.filter((r) => searchPredicate(r, query.trim().toLowerCase()))
  }, [rows, query, searchPredicate])

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return filtered
    const copy = [...filtered]
    copy.sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [filtered, sortKey, sortDir, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageRows = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize)

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return
    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(col.key)
      setSortDir('desc')
    }
    setPage(0)
  }

  return (
    <div>
      {searchable && (
        <div className="mb-3">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Caută..."
            className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-1.5 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col)}
                  className={clsx(
                    'whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500',
                    col.sortValue && 'cursor-pointer select-none hover:text-slate-700',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    !col.align && 'text-left',
                  )}
                >
                  {col.header} {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={rowKey(row)} className="hover:bg-slate-50">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={clsx(
                        'px-3 py-1.5 text-slate-700',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.className,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            Pagina {clampedPage + 1} din {totalPages} ({sorted.length} rânduri)
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage >= totalPages - 1}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40"
            >
              Următor →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
