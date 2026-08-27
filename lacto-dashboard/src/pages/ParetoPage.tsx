import { useMemo, useState } from 'react'
import { computeParetoAndAbc } from '../analytics/pareto'
import { KpiCard } from '../components/KpiCard'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber } from '../lib/ro-format'

type Dimension = 'byClient' | 'byProduct'

const ABC_COLOR = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  B: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  C: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

/** Pareto / 80-20 (spec §20) + Clasificare ABC (spec §21), pentru clienți sau produse. */
export function ParetoPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const [dimension, setDimension] = useState<Dimension>('byClient')
  const [classFilter, setClassFilter] = useState<'all' | 'A' | 'B' | 'C'>('all')
  const [search, setSearch] = useState('')

  const pareto = useMemo(() => (result ? computeParetoAndAbc(result[dimension]) : null), [result, dimension])

  const filteredRows = (pareto?.rows ?? [])
    .filter((r) => classFilter === 'all' || r.abcClass === classFilter)
    .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <ReportShell
      title="Pareto / ABC"
      description="Concentrarea vânzărilor și clasificarea ABC — pe clienți sau produse."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {() =>
        !pareto ? null : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-xs font-medium text-slate-500">Dimensiune</label>
              <select
                className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
                value={dimension}
                onChange={(e) => setDimension(e.target.value as Dimension)}
              >
                <option value="byClient">Clienți</option>
                <option value="byProduct">Produse</option>
              </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {pareto.topNShares.map((t) => (
                <KpiCard key={t.n} label={`Top ${t.n} generează`} value={`${t.sharePercent.toFixed(1)}%`} />
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {pareto.thresholds.map((t) => (
                <KpiCard
                  key={t.thresholdPercent}
                  label={`${dimension === 'byClient' ? 'Clienți' : 'Produse'} pentru ${t.thresholdPercent}%`}
                  value={formatNumber(t.itemCount)}
                />
              ))}
            </div>

            <div className="flex gap-3 mb-6">
              {(['A', 'B', 'C'] as const).map((cls) => (
                <button
                  key={cls}
                  onClick={() => setClassFilter(classFilter === cls ? 'all' : cls)}
                  className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                    classFilter === cls ? 'border-emerald-500' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded ${ABC_COLOR[cls]}`}>Clasa {cls}</span>
                  <div className="text-lg font-semibold mt-1">{formatNumber(pareto.countByClass[cls])}</div>
                  <div className="text-xs text-slate-400">
                    {pareto.itemCount > 0 ? ((pareto.countByClass[cls] / pareto.itemCount) * 100).toFixed(0) : 0}% din total
                  </div>
                </button>
              ))}
            </div>

            <input
              className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mb-3 w-full max-w-xs"
              placeholder="Caută…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{dimension === 'byClient' ? 'Client' : 'Produs'}</th>
                    <th className="px-3 py-2 text-right font-medium">Valoare</th>
                    <th className="px-3 py-2 text-right font-medium">Pondere</th>
                    <th className="px-3 py-2 text-right font-medium">Pondere cumulată</th>
                    <th className="px-3 py-2 text-center font-medium">ABC</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={`${r.id}-${r.name}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.value)}</td>
                      <td className="px-3 py-1.5 text-right">{r.share.toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-right">{r.cumulativeShare.toFixed(1)}%</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${ABC_COLOR[r.abcClass]}`}>{r.abcClass}</span>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                        Niciun rezultat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </ReportShell>
  )
}
