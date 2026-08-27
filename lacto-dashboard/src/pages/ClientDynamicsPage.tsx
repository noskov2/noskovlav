import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { computeClientDynamics, STATUS_LABEL } from '../analytics/clientDynamics'
import type { ClientDynamicsResult, ClientDynamicStatus } from '../analytics/clientDynamics'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber, formatPercent } from '../lib/ro-format'

const STATUS_COLOR: Record<ClientDynamicStatus, string> = {
  nou: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  reactivat: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400',
  crescut: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
  activ: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  scazut: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  pierdut: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
}

const STATUS_ORDER: ClientDynamicStatus[] = ['nou', 'reactivat', 'crescut', 'activ', 'scazut', 'pierdut']

/** Dinamica clienților (spec §19): nou / pierdut / reactivat / activ / în creștere / în scădere. */
export function ClientDynamicsPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()
  const [threshold, setThreshold] = useState(10)
  const [statusFilter, setStatusFilter] = useState<ClientDynamicStatus | 'all'>('all')
  const [dynamics, setDynamics] = useState<ClientDynamicsResult | null | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setDynamics(undefined)
    computeClientDynamics(filters, threshold).then((d) => {
      if (!cancelled) setDynamics(d)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, threshold])

  return (
    <ReportShell
      title="Dinamica clienților"
      description="Clienți noi, pierduți, reactivați, în creștere sau în scădere, față de perioada de comparație."
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
        !filters.comparisonPeriod ? (
          <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
            Selectează o perioadă de comparație (în bara de filtre de mai sus) pentru a calcula dinamica clienților.
          </div>
        ) : dynamics === undefined ? (
          <div className="text-sm text-slate-500">Se calculează…</div>
        ) : dynamics === null ? null : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-xs font-medium text-slate-500">Prag creștere/scădere semnificativă</label>
              <input
                type="number"
                min={1}
                max={100}
                className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm w-20"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 10)}
              />
              <span className="text-xs text-slate-400">%</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    statusFilter === s ? 'border-emerald-500' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLOR[s]}`}>{STATUS_LABEL[s]}</span>
                  <div className="text-lg font-semibold mt-1">{formatNumber(dynamics.countByStatus[s])}</div>
                  <div className="text-xs text-slate-400">{formatCurrency(dynamics.valueByStatus[s])}</div>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Client</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Valoare curentă</th>
                    <th className="px-3 py-2 text-right font-medium">Valoare comparație</th>
                    <th className="px-3 py-2 text-right font-medium">Diferență %</th>
                  </tr>
                </thead>
                <tbody>
                  {dynamics.rows
                    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
                    .map((r) => (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-1.5">
                          <button className="text-emerald-700 dark:text-emerald-400 hover:underline text-left" onClick={() => navigate(`/clienti/${r.id}`)}>
                            {r.name}
                          </button>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.currentValue)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap text-slate-500">{formatCurrency(r.previousValue)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatPercent(r.diffPercent)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
    </ReportShell>
  )
}
