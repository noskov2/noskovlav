import { useEffect, useState } from 'react'
import { mergeWithComparison } from '../analytics/compare'
import { computeGenericBreakdown, REPORT_DIMENSIONS } from '../analytics/genericBreakdown'
import type { ReportDimension } from '../analytics/genericBreakdown'
import type { BreakdownRow } from '../analytics/aggregate'
import { BreakdownTable } from '../components/BreakdownTable'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'

type IndicatorId = 'value' | 'quantity' | 'count' | 'clients' | 'avgPrice' | 'share' | 'diffValue' | 'diffPercent'

const INDICATORS: { id: IndicatorId; label: string }[] = [
  { id: 'value', label: 'Valoare' },
  { id: 'quantity', label: 'Cantitate' },
  { id: 'count', label: 'Tranzacții' },
  { id: 'clients', label: 'Clienți' },
  { id: 'avgPrice', label: 'Preț mediu' },
  { id: 'share', label: 'Pondere' },
  { id: 'diffValue', label: 'Diferență' },
  { id: 'diffPercent', label: 'Diferență %' },
]

const DEFAULT_INDICATORS: Record<IndicatorId, boolean> = {
  value: true,
  quantity: true,
  count: true,
  clients: true,
  avgPrice: true,
  share: true,
  diffValue: false,
  diffPercent: false,
}

type TopN = 'all' | 'top5' | 'top10' | 'top20' | 'top50' | 'bottom10'

const TOP_N_OPTIONS: { id: TopN; label: string }[] = [
  { id: 'all', label: 'Toate' },
  { id: 'top5', label: 'Top 5' },
  { id: 'top10', label: 'Top 10' },
  { id: 'top20', label: 'Top 20' },
  { id: 'top50', label: 'Top 50' },
  { id: 'bottom10', label: 'Bottom 10' },
]

function applyTopN<T extends BreakdownRow>(rows: T[], topN: TopN): T[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  switch (topN) {
    case 'top5':
      return sorted.slice(0, 5)
    case 'top10':
      return sorted.slice(0, 10)
    case 'top20':
      return sorted.slice(0, 20)
    case 'top50':
      return sorted.slice(0, 50)
    case 'bottom10':
      return sorted.slice(-10).reverse()
    default:
      return sorted
  }
}

/** Generator de rapoarte (spec §29): alege dimensiunea, indicatorii și Top N — fără raport fix, complet flexibil. */
export function ReportBuilderPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const [dimension, setDimension] = useState<ReportDimension>('client')
  const [indicators, setIndicators] = useState<Record<IndicatorId, boolean>>(DEFAULT_INDICATORS)
  const [topN, setTopN] = useState<TopN>('all')
  const [rows, setRows] = useState<BreakdownRow[] | undefined>(undefined)
  const [compRows, setCompRows] = useState<BreakdownRow[] | null>(null)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setRows(undefined)
    Promise.all([
      computeGenericBreakdown(filters, dimension),
      filters.comparisonPeriod ? computeGenericBreakdown({ ...filters, period: filters.comparisonPeriod }, dimension) : Promise.resolve(null),
    ]).then(([r, cr]) => {
      if (!cancelled) {
        setRows(r)
        setCompRows(cr)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, dimension])

  function toggleIndicator(id: IndicatorId) {
    setIndicators((s) => ({ ...s, [id]: !s[id] }))
  }

  const dimensionLabel = REPORT_DIMENSIONS.find((d) => d.id === dimension)?.label ?? 'Grup'

  return (
    <ReportShell
      title="Generator de rapoarte"
      description="Alege dimensiunea, indicatorii de afișat și un Top N — raportul se recalculează instant."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {(r) => (
        <div>
          <div className="flex flex-wrap items-end gap-6 mb-4 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Dimensiune</label>
              <select
                aria-label="Selector dimensiune raport"
                className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
                value={dimension}
                onChange={(e) => setDimension(e.target.value as ReportDimension)}
              >
                {REPORT_DIMENSIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Top N</label>
              <select
                aria-label="Selector Top N"
                className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
                value={topN}
                onChange={(e) => setTopN(e.target.value as TopN)}
              >
                {TOP_N_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Indicatori</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-w-xl">
                {INDICATORS.map((ind) => (
                  <label key={ind.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={indicators[ind.id]}
                      disabled={(ind.id === 'diffValue' || ind.id === 'diffPercent') && !filters.comparisonPeriod}
                      onChange={() => toggleIndicator(ind.id)}
                    />
                    {ind.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {rows === undefined ? (
            <div className="text-sm text-slate-500">Se calculează…</div>
          ) : (
            <BreakdownTable
              rows={applyTopN(mergeWithComparison(rows, compRows, r.totalValue), topN)}
              nameLabel={dimensionLabel}
              showValue={indicators.value}
              showQuantity={indicators.quantity}
              showCount={indicators.count}
              showClients={indicators.clients}
              showAvgPrice={indicators.avgPrice}
              showShare={indicators.share}
              showDiffValue={indicators.diffValue && !!filters.comparisonPeriod}
              showComparison={indicators.diffPercent && !!filters.comparisonPeriod}
            />
          )}
        </div>
      )}
    </ReportShell>
  )
}
