import { useEffect, useState } from 'react'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { computeSeasonality } from '../analytics/seasonality'
import type { SeasonalityResult, SeasonalityDimension } from '../analytics/seasonality'
import { formatCurrency, formatNumber } from '../lib/ro-format'

const MONTH_SHORT = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

const DIMENSIONS: { id: SeasonalityDimension; label: string }[] = [
  { id: 'category', label: 'Categorie' },
  { id: 'product', label: 'Produs' },
  { id: 'channel', label: 'Canal' },
]

const TREND_LABEL = { crescator: '↑ crescător', descrescator: '↓ descrescător', stabil: '→ stabil' } as const
const TREND_COLOR = {
  crescator: 'text-emerald-600 dark:text-emerald-400',
  descrescator: 'text-rose-600 dark:text-rose-400',
  stabil: 'text-slate-500',
} as const

const MAX_ROWS = 15

/** Analiză Sezonalitate (spec §16, §26): pivot lună × categorie/produs/canal, trend, coeficient de variație. */
export function SeasonalityPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const [dimension, setDimension] = useState<SeasonalityDimension>('category')
  const [seasonality, setSeasonality] = useState<SeasonalityResult | null>(null)
  const [computing, setComputing] = useState(true)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setComputing(true)
    computeSeasonality(filters, dimension).then((res) => {
      if (!cancelled) {
        setSeasonality(res)
        setComputing(false)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, dimension])

  return (
    <ReportShell
      title="Sezonalitate"
      description="Evoluție lunară pe categorie, produs sau canal — trend și coeficient de variație."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {() => (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs font-medium text-slate-500">Dimensiune</label>
            <select
              className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
              value={dimension}
              onChange={(e) => setDimension(e.target.value as SeasonalityDimension)}
            >
              {DIMENSIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {computing || !seasonality ? (
            <div className="text-sm text-slate-500">Se calculează…</div>
          ) : seasonality.rows.length === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Niciun rând nu corespunde filtrelor selectate.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium sticky left-0 bg-slate-50 dark:bg-slate-900">
                      {DIMENSIONS.find((d) => d.id === dimension)?.label}
                    </th>
                    {seasonality.months.map((m) => (
                      <th key={m.key} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        {MONTH_SHORT[m.month - 1]} {String(m.year).slice(2)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">CV%</th>
                    <th className="px-3 py-2 text-left font-medium">Trend</th>
                    <th className="px-3 py-2 text-left font-medium">Cea mai bună</th>
                    <th className="px-3 py-2 text-left font-medium">Cea mai slabă</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonality.rows.slice(0, MAX_ROWS).map((r) => (
                    <tr key={`${r.id}-${r.name}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-950">{r.name}</td>
                      {seasonality.months.map((m) => (
                        <td key={m.key} className="px-2 py-1.5 text-right whitespace-nowrap text-xs">
                          {r.valueByMonth[m.key] > 0 ? formatNumber(Math.round(r.valueByMonth[m.key])) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right">{r.coefficientOfVariation !== null ? `${r.coefficientOfVariation.toFixed(0)}%` : '—'}</td>
                      <td className={`px-3 py-1.5 whitespace-nowrap ${TREND_COLOR[r.trend]}`}>{TREND_LABEL[r.trend]}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500">
                        {r.bestMonth ? `${MONTH_SHORT[r.bestMonth.month - 1]} ${r.bestMonth.year} (${formatCurrency(Math.max(...Object.values(r.valueByMonth)))})` : '—'}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500">
                        {r.worstMonth ? `${MONTH_SHORT[r.worstMonth.month - 1]} ${r.worstMonth.year}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {seasonality.rows.length > MAX_ROWS && (
                <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                  Se afișează primele {MAX_ROWS} din {formatNumber(seasonality.rows.length)}, sortate după valoare totală. Folosește filtrele pentru a restrânge selecția.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </ReportShell>
  )
}
