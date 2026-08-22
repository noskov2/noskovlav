import { useMemo, useState } from 'react'
import { useFilterStore } from '@/store/filterStore'
import { useDataStore } from '@/store/dataStore'
import { PERIOD_LABELS, type PeriodPreset } from '@/kpi/dateRanges'
import { effectiveRange } from '@/kpi/filterState'
import { formatDateRo } from '@/lib/format'

const PRESET_ORDER: PeriodPreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'custom',
]

interface FilterBarProps {
  hideCategory?: boolean
  hideProduct?: boolean
  hideShift?: boolean
  hideCashier?: boolean
}

export function FilterBar({ hideCategory, hideProduct, hideShift, hideCashier }: FilterBarProps) {
  const { filter, setFilter } = useFilterStore()
  const { cashiers, products, teams } = useDataStore()
  const [showCustom, setShowCustom] = useState(filter.preset === 'custom')

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort()
  }, [products])

  const range = effectiveRange(filter)

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-1">
        {PRESET_ORDER.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              setFilter({ preset })
              setShowCustom(preset === 'custom')
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter.preset === preset
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {PERIOD_LABELS[preset]}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            value={filter.customRange?.start ?? range.start}
            onChange={(e) =>
              setFilter({ customRange: { start: e.target.value, end: filter.customRange?.end ?? range.end } })
            }
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={filter.customRange?.end ?? range.end}
            onChange={(e) =>
              setFilter({ customRange: { start: filter.customRange?.start ?? range.start, end: e.target.value } })
            }
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </div>
      )}

      <span className="ml-1 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
        {formatDateRo(range.start)} – {formatDateRo(range.end)}
      </span>

      <div className="ml-auto flex flex-wrap gap-2">
        {!hideCashier && teams.length > 0 && (
          <select
            value={filter.teamId}
            onChange={(e) => setFilter({ teamId: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="all">Toate echipele</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {!hideCashier && (
          <select
            value={filter.cashierId}
            onChange={(e) => setFilter({ cashierId: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="all">Toți casierii</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {!hideShift && (
          <select
            value={filter.shift}
            onChange={(e) => setFilter({ shift: e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2) })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="all">Toate turele</option>
            <option value="1">Tura 1</option>
            <option value="2">Tura 2</option>
          </select>
        )}
        {!hideCategory && (
          <select
            value={filter.category}
            onChange={(e) => setFilter({ category: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="all">Toate categoriile</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {!hideProduct && (
          <select
            value={filter.productId}
            onChange={(e) => setFilter({ productId: e.target.value })}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="all">Toate produsele</option>
            {products
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        )}
      </div>
    </div>
  )
}
