import type { GlobalFilters } from '../analytics/filters'
import type { CategoryRecord, ClientRecord, ProductRecord } from '../types'
import { MultiSelectFilter } from './MultiSelectFilter'
import { PeriodSelector } from './PeriodSelector'

const CHANNEL_OPTIONS = [
  { value: 'RETELE', label: 'Rețele' },
  { value: 'MAGAZINE PROPRII', label: 'Magazine proprii' },
  { value: 'DISTRIBUTIE', label: 'Distribuție' },
]

interface Props {
  filters: GlobalFilters
  patchFilters: (patch: Partial<GlobalFilters>) => void
  clients?: ClientRecord[]
  products?: ProductRecord[]
  categories?: CategoryRecord[]
  hide?: Partial<Record<'channel' | 'client' | 'product' | 'category', boolean>>
}

/** Bara de filtre globale (spec §14) — reutilizată de toate paginile de raport. */
export function FilterBar({ filters, patchFilters, clients, products, categories, hide }: Props) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4">
      <PeriodSelector
        period={filters.period}
        comparisonMode={filters.comparisonMode}
        comparisonPeriod={filters.comparisonPeriod}
        onChange={patchFilters}
      />
      {!hide?.channel && (
        <MultiSelectFilter
          label="Canal"
          options={CHANNEL_OPTIONS}
          selected={filters.channels}
          onChange={(v) => patchFilters({ channels: v as GlobalFilters['channels'] })}
        />
      )}
      {!hide?.client && (
        <MultiSelectFilter
          label="Client"
          options={(clients ?? []).map((c) => ({ value: String(c.id), label: c.canonicalName }))}
          selected={filters.clientIds.map(String)}
          onChange={(v) => patchFilters({ clientIds: v.map(Number) })}
        />
      )}
      {!hide?.product && (
        <MultiSelectFilter
          label="Produs"
          options={(products ?? []).map((p) => ({ value: String(p.id), label: p.canonicalName }))}
          selected={filters.productIds.map(String)}
          onChange={(v) => patchFilters({ productIds: v.map(Number) })}
        />
      )}
      {!hide?.category && (
        <MultiSelectFilter
          label="Categorie"
          options={(categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
          selected={filters.categoryIds.map(String)}
          onChange={(v) => patchFilters({ categoryIds: v.map(Number) })}
        />
      )}
    </div>
  )
}
