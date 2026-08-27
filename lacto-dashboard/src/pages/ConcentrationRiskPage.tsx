import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { computeConcentration } from '../analytics/concentration'
import { KpiCard } from '../components/KpiCard'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber } from '../lib/ro-format'

const RISK_LABEL = { scazut: 'Risc scăzut', moderat: 'Risc moderat', ridicat: 'Risc ridicat' } as const
const RISK_COLOR = {
  scazut: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  moderat: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  ridicat: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
} as const

/** Risc de concentrare / dependență de clienți (spec §24). */
export function ConcentrationRiskPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()

  const concentration = useMemo(() => (result ? computeConcentration(result.byClient) : null), [result])

  return (
    <ReportShell
      title="Risc de concentrare"
      description="Dependența companiei de un număr mic de clienți — cu cât ponderea Top N e mai mare, cu atât riscul e mai ridicat."
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
        !concentration ? null : (
          <div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Indice de concentrare (Herfindahl-Hirschman)</div>
                <div className="text-2xl font-semibold">{concentration.herfindahlIndex.toFixed(0)}</div>
              </div>
              <span className={`text-sm px-3 py-1.5 rounded-full ${RISK_COLOR[concentration.riskLevel]}`}>{RISK_LABEL[concentration.riskLevel]}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <KpiCard label="Top 1 client" value={`${concentration.top1Share.toFixed(1)}%`} />
              <KpiCard label="Top 5 clienți" value={`${concentration.top5Share.toFixed(1)}%`} />
              <KpiCard label="Top 10 clienți" value={`${concentration.top10Share.toFixed(1)}%`} />
              <KpiCard label="Top 20 clienți" value={`${concentration.top20Share.toFixed(1)}%`} />
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="text-sm font-medium mb-2">
                Clienți care reprezintă peste 5% din cifra de vânzări ({formatNumber(concentration.clientsAboveThreshold.length)})
              </div>
              {concentration.clientsAboveThreshold.length === 0 ? (
                <div className="text-sm text-slate-400">Niciun client nu depășește 5% din total — concentrare scăzută la acest nivel.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {concentration.clientsAboveThreshold.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800 first:border-0">
                        <td className="py-1.5">
                          <button className="text-emerald-700 dark:text-emerald-400 hover:underline text-left" onClick={() => c.id !== null && navigate(`/clienti/${c.id}`)}>
                            {c.name}
                          </button>
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">{formatCurrency((c.share / 100) * concentration.totalValue)}</td>
                        <td className="py-1.5 text-right w-20">{c.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      }
    </ReportShell>
  )
}
