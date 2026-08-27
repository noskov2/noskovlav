import { useMemo, useState } from 'react'
import type { BreakdownRow } from '../analytics/aggregate'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber, formatPercent, formatQuantity } from '../lib/ro-format'

type Dimension = 'byChannel' | 'byClient' | 'byCategory' | 'byProduct'

const DIMENSIONS: { id: Dimension; label: string }[] = [
  { id: 'byChannel', label: 'Canal' },
  { id: 'byClient', label: 'Client' },
  { id: 'byCategory', label: 'Categorie' },
  { id: 'byProduct', label: 'Produs' },
]

interface PriceRow {
  id: number | null
  name: string
  value: number
  quantity: number
  avgPrice: number | null
  previousAvgPrice: number | null
  diffPercent: number | null
}

function toPriceRows(current: BreakdownRow[], previous: BreakdownRow[] | null): PriceRow[] {
  const key = (r: BreakdownRow) => (r.id !== null ? `id:${r.id}` : `name:${r.name}`)
  const previousByKey = new Map((previous ?? []).map((r) => [key(r), r]))

  return current
    .map((r) => {
      const avgPrice = r.quantity > 0 ? r.value / r.quantity : null
      const prev = previousByKey.get(key(r)) ?? null
      const previousAvgPrice = prev && prev.quantity > 0 ? prev.value / prev.quantity : null
      const diffPercent =
        avgPrice !== null && previousAvgPrice !== null && previousAvgPrice !== 0 ? ((avgPrice - previousAvgPrice) / previousAvgPrice) * 100 : null
      return { id: r.id, name: r.name, value: r.value, quantity: r.quantity, avgPrice, previousAvgPrice, diffPercent }
    })
    .filter((r) => r.avgPrice !== null)
    .sort((a, b) => (b.avgPrice ?? 0) - (a.avgPrice ?? 0))
}

/** Analiză Preț (spec §16): preț mediu pe canal/client/categorie/produs + modificare vs. perioada de comparație. */
export function PricesPage() {
  const { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories } = useReportData()
  const [dimension, setDimension] = useState<Dimension>('byProduct')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    if (!result) return []
    const current = result[dimension] as BreakdownRow[]
    const previous = (comparison?.[dimension] as BreakdownRow[] | undefined) ?? null
    return toPriceRows(current, previous)
  }, [result, comparison, dimension])

  const filteredRows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <ReportShell
      title="Analiză prețuri"
      description="Preț mediu ponderat (valoare/cantitate) pe canal, client, categorie sau produs, cu modificare față de perioada de comparație."
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
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Dimensiune</label>
              <select
                className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
                value={dimension}
                onChange={(e) => setDimension(e.target.value as Dimension)}
              >
                {DIMENSIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
              placeholder="Caută…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredRows.length === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Niciun rând cu cantitate &gt; 0 pentru a calcula un preț mediu.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{DIMENSIONS.find((d) => d.id === dimension)?.label}</th>
                    <th className="px-3 py-2 text-right font-medium">Valoare totală</th>
                    <th className="px-3 py-2 text-right font-medium">Cantitate</th>
                    <th className="px-3 py-2 text-right font-medium">Preț mediu</th>
                    <th className="px-3 py-2 text-right font-medium">Preț mediu (comparație)</th>
                    <th className="px-3 py-2 text-right font-medium">Modificare %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={`${r.id}-${r.name}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.value)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatQuantity(r.quantity)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium">{formatCurrency(r.avgPrice)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap text-slate-500">
                        {r.previousAvgPrice !== null ? formatCurrency(r.previousAvgPrice) : '—'}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right whitespace-nowrap ${
                          r.diffPercent === null ? 'text-slate-400' : r.diffPercent > 0 ? 'text-emerald-600 dark:text-emerald-400' : r.diffPercent < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                        }`}
                      >
                        {formatPercent(r.diffPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                {formatNumber(filteredRows.length)} rânduri cu cantitate &gt; 0.
              </div>
            </div>
          )}
        </div>
      )}
    </ReportShell>
  )
}
