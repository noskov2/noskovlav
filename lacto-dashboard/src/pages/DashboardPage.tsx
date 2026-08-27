import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AggregateResult } from '../analytics/aggregate'
import { FilterBar } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useReportData } from '../hooks/useReportData'
import { growthPercent } from '../lib/kpi'
import { formatCurrency, formatNumber, formatQuantity } from '../lib/ro-format'

const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function DashboardPage() {
  const { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories } = useReportData()

  if (totalTransactions === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold mb-4">Dashboard</h1>
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 text-center">
          Nu există încă date importate. Mergi la „Import date" pentru a încărca primul export din Mentor.
        </div>
      </div>
    )
  }

  const monthsInRange = result ? Math.max(1, result.byMonth.length) : 1

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>

      <FilterBar filters={filters} patchFilters={patchFilters} clients={clients} products={products} categories={categories} />

      {loading || !result ? (
        <div className="text-sm text-slate-500">Se calculează…</div>
      ) : result.transactionCount === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          Niciun rând nu corespunde filtrelor selectate.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Total vânzări" value={formatCurrency(result.totalValue)} growth={growthPercent(result.totalValue, comparison?.totalValue)} />
            <KpiCard label="Total cantitate" value={formatQuantity(result.totalQuantity)} growth={growthPercent(result.totalQuantity, comparison?.totalQuantity)} />
            <KpiCard label="Nr. tranzacții" value={formatNumber(result.transactionCount)} />
            <KpiCard label="Clienți activi" value={formatNumber(result.distinctClients)} />
            <KpiCard label="Produse vândute" value={formatNumber(result.distinctProducts)} />
            <KpiCard label="Vânzare medie / lună" value={formatCurrency(result.totalValue / monthsInRange)} />
            <KpiCard label="Vânzare medie / client" value={formatCurrency(result.avgValuePerClient)} />
            <KpiCard label="Vânzare medie / tranzacție" value={formatCurrency(result.avgValuePerTransaction)} />
            <KpiCard label="Vânzare medie / produs" value={formatCurrency(result.totalValue / Math.max(1, result.distinctProducts))} />
            <KpiCard label="Preț mediu" value={result.avgPricePerUnit !== null ? `${formatCurrency(result.avgPricePerUnit).replace(' lei', '')} lei/unit.` : '—'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <TopCard title="Top canal" rows={result.byChannel} />
            <TopCard title="Top client" rows={result.byClient} />
            <TopCard title="Top produs" rows={result.byProduct} />
            <TopCard title="Top categorie" rows={result.byCategory} />
          </div>

          {result.byMonth.length > 1 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
              <div className="text-sm font-medium mb-3">Evoluție lunară — valoare</div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={result.byMonth.map((m) => ({ label: monthLabel(m.year, m.month), value: m.value }))}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                    <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                    <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {(() => {
                const best = result.byMonth.reduce((a, b) => (b.value > a.value ? b : a))
                const worst = result.byMonth.reduce((a, b) => (b.value < a.value ? b : a))
                return (
                  <div className="flex gap-6 text-xs text-slate-500 mt-2">
                    <span>
                      Cea mai bună lună: <strong className="text-slate-700 dark:text-slate-200">{monthLabel(best.year, best.month)}</strong> (
                      {formatCurrency(best.value)})
                    </span>
                    <span>
                      Cea mai slabă lună: <strong className="text-slate-700 dark:text-slate-200">{monthLabel(worst.year, worst.month)}</strong> (
                      {formatCurrency(worst.value)})
                    </span>
                  </div>
                )
              })()}
            </div>
          )}

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="text-sm font-medium mb-3">Valoare pe canal</div>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={result.byChannel.map((c) => ({ label: c.name, value: c.value }))}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TopCard({ title, rows }: { title: string; rows: AggregateResult['byChannel'] }) {
  const top = rows[0]
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="text-xs text-slate-500 mb-1">{title}</div>
      {top ? (
        <>
          <div className="text-sm font-semibold">{top.name}</div>
          <div className="text-xs text-slate-400">{formatCurrency(top.value)}</div>
        </>
      ) : (
        <div className="text-sm text-slate-400">—</div>
      )}
    </div>
  )
}
