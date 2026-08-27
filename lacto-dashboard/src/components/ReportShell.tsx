import type { ReactNode } from 'react'
import type { AggregateResult } from '../analytics/aggregate'
import type { GlobalFilters } from '../analytics/filters'
import { FilterBar } from './FilterBar'
import type { ClientRecord, ProductRecord, CategoryRecord } from '../types'

interface Props {
  title: string
  description?: string
  filters: GlobalFilters
  patchFilters: (patch: Partial<GlobalFilters>) => void
  clients?: ClientRecord[]
  products?: ProductRecord[]
  categories?: CategoryRecord[]
  hide?: Parameters<typeof FilterBar>[0]['hide']
  totalTransactions: number | undefined
  loading: boolean
  result: AggregateResult | null
  children: (result: AggregateResult) => ReactNode
}

/** Cadru comun tuturor paginilor de raport: titlu, filtre, stări de încărcare/gol. */
export function ReportShell({
  title,
  description,
  filters,
  patchFilters,
  clients,
  products,
  categories,
  hide,
  totalTransactions,
  loading,
  result,
  children,
}: Props) {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{title}</h1>
      {description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{description}</p>}

      {totalTransactions === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 text-center">
          Nu există încă date importate. Mergi la „Import date" pentru a încărca primul export din Mentor.
        </div>
      ) : (
        <>
          <FilterBar filters={filters} patchFilters={patchFilters} clients={clients} products={products} categories={categories} hide={hide} />
          {loading || !result ? (
            <div className="text-sm text-slate-500">Se calculează…</div>
          ) : result.transactionCount === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Niciun rând nu corespunde filtrelor selectate.
            </div>
          ) : (
            children(result)
          )}
        </>
      )}
    </div>
  )
}
