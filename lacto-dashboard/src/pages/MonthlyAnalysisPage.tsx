import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber, formatPercent, formatQuantity } from '../lib/ro-format'

const MONTH_NAMES = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']

/** Analiză Lunară (spec §16): valoare, cantitate, tranzacții, clienți activi, preț mediu, diferență lună-peste-lună. */
export function MonthlyAnalysisPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()

  return (
    <ReportShell
      title="Analiză lunară"
      description="Evoluție lună de lună, cu diferență față de luna precedentă din interval."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {(r) => {
        const rows = r.byMonth.map((m, i) => {
          const prev = i > 0 ? r.byMonth[i - 1] : null
          const diffValue = prev ? m.value - prev.value : null
          const diffPercent = prev ? (prev.value > 0 ? ((m.value - prev.value) / prev.value) * 100 : null) : null
          return { ...m, diffValue, diffPercent }
        })

        return (
          <>
            {r.byMonth.length > 1 && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={r.byMonth.map((m) => ({ label: `${MONTH_NAMES[m.month - 1].slice(0, 3)} ${m.year}`, value: m.value }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Lună</th>
                    <th className="px-3 py-2 text-right font-medium">Valoare</th>
                    <th className="px-3 py-2 text-right font-medium">Cantitate</th>
                    <th className="px-3 py-2 text-right font-medium">Tranzacții</th>
                    <th className="px-3 py-2 text-right font-medium">Clienți activi</th>
                    <th className="px-3 py-2 text-right font-medium">Preț mediu</th>
                    <th className="px-3 py-2 text-right font-medium">Diferență</th>
                    <th className="px-3 py-2 text-right font-medium">Diferență %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={`${m.year}-${m.month}`} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-1.5">
                        {MONTH_NAMES[m.month - 1]} {m.year}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(m.value)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatQuantity(m.quantity)}</td>
                      <td className="px-3 py-1.5 text-right">{formatNumber(m.count)}</td>
                      <td className="px-3 py-1.5 text-right">{formatNumber(m.distinctClients)}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{m.quantity > 0 ? formatCurrency(m.value / m.quantity) : '—'}</td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">{m.diffValue !== null ? formatCurrency(m.diffValue) : '—'}</td>
                      <td
                        className={`px-3 py-1.5 text-right whitespace-nowrap ${
                          m.diffPercent === null ? 'text-slate-400' : m.diffPercent > 0 ? 'text-emerald-600 dark:text-emerald-400' : m.diffPercent < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                        }`}
                      >
                        {formatPercent(m.diffPercent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      }}
    </ReportShell>
  )
}
