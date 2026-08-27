import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { computeCrossSell } from '../analytics/crossSell'
import type { CrossSellResult } from '../analytics/crossSell'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber } from '../lib/ro-format'

/** Cross-sell / white space (spec §23): ce cumpără un client, și ce cumpără clienți similari dar el nu. */
export function CrossSellPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()
  const [clientId, setClientId] = useState<number | null>(null)
  const [crossSell, setCrossSell] = useState<CrossSellResult | null | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    if (clientId === null) {
      setCrossSell(undefined)
      return
    }
    let cancelled = false
    setCrossSell(undefined)
    computeCrossSell(clientId, filters).then((r) => {
      if (!cancelled) setCrossSell(r)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, filtersKey])

  return (
    <ReportShell
      title="Cross-sell / White space"
      description="Alege un client: ce cumpără deja, și ce cumpără clienți similari (același canal principal) dar el încă nu — oportunități comerciale."
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
            <label className="text-xs font-medium text-slate-500 block mb-1">Client</label>
            <select
              className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm min-w-[240px]"
              value={clientId ?? ''}
              onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— alege un client —</option>
              {(clients ?? [])
                .slice()
                .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ro'))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.canonicalName}
                  </option>
                ))}
            </select>
          </div>

          {clientId === null ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Selectează un client pentru a vedea oportunitățile de cross-sell.
            </div>
          ) : crossSell === undefined ? (
            <div className="text-sm text-slate-500">Se calculează…</div>
          ) : crossSell === null ? null : crossSell.purchasedCategories.length === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Acest client nu are vânzări în perioada selectată.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                <div className="text-sm font-medium mb-1">Ce cumpără {crossSell.clientName}</div>
                <div className="text-xs text-slate-400 mb-3">Canal principal: {crossSell.primaryChannel}</div>
                <table className="w-full text-sm">
                  <tbody>
                    {crossSell.purchasedCategories.map((c) => (
                      <tr key={`${c.id}`} className="border-t border-slate-100 dark:border-slate-800 first:border-0">
                        <td className="py-1.5">{c.name}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">{formatCurrency(c.value)}</td>
                        <td className="py-1.5 text-right w-16">{c.share.toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                <div className="text-sm font-medium mb-1">Oportunități (nu cumpără încă)</div>
                <div className="text-xs text-slate-400 mb-3">
                  Comparativ cu {formatNumber(crossSell.peerCount)} clienți similari de pe canalul {crossSell.primaryChannel}
                </div>
                {crossSell.opportunities.length === 0 ? (
                  <div className="text-sm text-slate-400">Clientul cumpără deja toate categoriile pe care le cumpără și peers-ii lui.</div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {crossSell.opportunities.map((o) => (
                        <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800 first:border-0">
                          <td className="py-1.5">{o.name}</td>
                          <td className="py-1.5 text-right whitespace-nowrap">{formatCurrency(o.peerValue)}</td>
                          <td className="py-1.5 text-right w-24 text-slate-400">{formatNumber(o.peerClientCount)} clienți</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="lg:col-span-2 text-right">
                <button className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline" onClick={() => navigate(`/clienti/${clientId}`)}>
                  vezi profilul complet (Client 360°) →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </ReportShell>
  )
}
