import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { computeProductPriceAnalysis } from '../analytics/priceOutliers'
import type { ProductPriceAnalysis } from '../analytics/priceOutliers'
import { KpiCard } from '../components/KpiCard'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber, formatPercent } from '../lib/ro-format'

/** Analiza prețurilor — outlieri per produs (spec §25). */
export function PriceOutliersPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()
  const [productId, setProductId] = useState<number | null>(null)
  const [analysis, setAnalysis] = useState<ProductPriceAnalysis | null | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    if (productId === null) {
      setAnalysis(undefined)
      return
    }
    let cancelled = false
    setAnalysis(undefined)
    computeProductPriceAnalysis(productId, filters).then((r) => {
      if (!cancelled) setAnalysis(r)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, filtersKey])

  return (
    <ReportShell
      title="Analiza prețurilor"
      description="Alege un produs: prețul plătit de fiecare client, abaterea față de media ponderată, și outlierii."
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
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-500 block mb-1">Produs</label>
            <select
              className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm min-w-[240px]"
              value={productId ?? ''}
              onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— alege un produs —</option>
              {(products ?? [])
                .slice()
                .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ro'))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.canonicalName}
                  </option>
                ))}
            </select>
          </div>

          {productId === null ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Selectează un produs pentru a analiza prețurile plătite de clienți.
            </div>
          ) : analysis === undefined ? (
            <div className="text-sm text-slate-500">Se calculează…</div>
          ) : analysis === null || analysis.rows.length === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Nu există vânzări cu cantitate pentru acest produs în perioada selectată.
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <KpiCard label="Preț minim" value={analysis.minPrice !== null ? formatCurrency(analysis.minPrice) : '—'} />
                <KpiCard label="Preț median" value={analysis.medianPrice !== null ? formatCurrency(analysis.medianPrice) : '—'} />
                <KpiCard label="Preț mediu ponderat" value={analysis.weightedAvgPrice !== null ? formatCurrency(analysis.weightedAvgPrice) : '—'} />
                <KpiCard label="Preț maxim" value={analysis.maxPrice !== null ? formatCurrency(analysis.maxPrice) : '—'} />
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Client</th>
                      <th className="px-3 py-2 text-right font-medium">Valoare</th>
                      <th className="px-3 py-2 text-right font-medium">Cantitate</th>
                      <th className="px-3 py-2 text-right font-medium">Preț mediu</th>
                      <th className="px-3 py-2 text-right font-medium">Abatere</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.rows.map((r) => (
                      <tr key={r.clientId ?? 'null'} className={`border-t border-slate-100 dark:border-slate-800 ${r.isOutlier ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                        <td className="px-3 py-1.5">
                          {r.clientId !== null ? (
                            <button className="text-emerald-700 dark:text-emerald-400 hover:underline text-left" onClick={() => navigate(`/clienti/${r.clientId}`)}>
                              {r.clientName}
                            </button>
                          ) : (
                            r.clientName
                          )}
                          {r.isOutlier && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-300">outlier</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.value)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatNumber(r.quantity)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">{formatCurrency(r.avgPrice)}</td>
                        <td
                          className={`px-3 py-1.5 text-right whitespace-nowrap ${
                            r.deviationPercent > 0 ? 'text-emerald-600 dark:text-emerald-400' : r.deviationPercent < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                          }`}
                        >
                          {formatPercent(r.deviationPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </ReportShell>
  )
}
