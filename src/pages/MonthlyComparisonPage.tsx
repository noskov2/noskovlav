import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { useDataStore } from '@/store/dataStore'
import { computeMonthlySeries, type MonthlyRow } from '@/kpi/monthlySeries'
import { computeDelta } from '@/kpi/monthComparison'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

interface MetricDef {
  key: string
  label: string
  get: (r: MonthlyRow) => number | null
  format: (v: number) => string
  sub?: boolean // rendered as an indented "din care" breakdown of the row above
}

const METRICS: MetricDef[] = [
  { key: 'totalSales', label: 'Vânzări totale', get: (r) => r.summary.totalSales, format: formatLei },
  { key: 'goodsSales', label: 'Vânzări marfă', get: (r) => r.summary.goodsSales, format: formatLei },
  { key: 'fuelSales', label: 'Vânzări carburant', get: (r) => r.summary.fuelSales, format: formatLei },
  { key: 'totalLiters', label: 'Litri combustibil', get: (r) => r.summary.totalLiters, format: (v) => formatNumber(v) },
  { key: 'receiptCount', label: 'Bonuri', get: (r) => r.summary.receiptCount, format: (v) => formatNumber(v) },
  { key: 'avgReceiptValue', label: 'Bon mediu', get: (r) => r.summary.avgReceiptValue, format: formatLei },
  { key: 'crossSellPct', label: 'Cross-sell', get: (r) => r.summary.crossSellPct, format: (v) => formatPct(v) },
  { key: 'coffeeCount', label: 'Cafele vândute', get: (r) => r.summary.coffeeCount, format: (v) => formatNumber(v) },
  { key: 'sandwichCount', label: 'Sandwich-uri vândute', get: (r) => r.summary.sandwichCount, format: (v) => formatNumber(v) },
  { key: 'vitrinaCount', label: 'Dulciuri vitrină vândute', get: (r) => r.summary.vitrinaCount, format: (v) => formatNumber(v) },
  { key: 'lemonadeCount', label: 'Limonade/ceaiuri vândute', get: (r) => r.summary.lemonadeCount, format: (v) => formatNumber(v) },
  { key: 'promoValue', label: 'Vânzări prin promoții', get: (r) => r.summary.promoValue, format: formatLei },
  { key: 'grossProfit', label: 'Profit brut (cost cunoscut)', get: (r) => r.grossProfit, format: formatLei },
  { key: 'fuelGrossProfit', label: 'din care: Combustibil', get: (r) => r.fuelGrossProfit, format: formatLei, sub: true },
  { key: 'goodsGrossProfit', label: 'din care: Marfă', get: (r) => r.goodsGrossProfit, format: formatLei, sub: true },
  { key: 'marginPct', label: 'Marjă', get: (r) => r.marginPct, format: (v) => formatPct(v) },
]

export function MonthlyComparisonPage() {
  const { transactions, products, supplierReceipts, settings } = useDataStore()
  const defaultVatRatePct = settings?.defaultVatRatePct ?? 19

  const months = useMemo(
    () => computeMonthlySeries(transactions, products, supplierReceipts, defaultVatRatePct),
    [transactions, products, supplierReceipts, defaultVatRatePct],
  )

  const chartData = useMemo(
    () => months.map((m) => ({ label: m.shortLabel, value: m.summary.totalSales })),
    [months],
  )

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Comparație lunară" />
        <EmptyState />
      </div>
    )
  }

  if (months.length < 2) {
    return (
      <div>
        <PageHeader
          title="Comparație lunară"
          description="Compară vânzările, profitul și cross-sell-ul lună de lună."
        />
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Ai date pentru o singură lună ({months[0]?.label ?? '—'}) — comparația apare automat de îndată ce imporți
          date din cel puțin o lună diferită.
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Comparație lunară"
        description="Fiecare lună cu date, una lângă alta — cu variația față de luna anterioară sub fiecare valoare."
      />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Vânzări totale pe lună</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip formatter={(v) => formatLei(Number(v))} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
            <Bar dataKey="value" fill="#1fa46c" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="sticky left-0 bg-white px-3 py-2">Indicator</th>
                {months.map((m) => (
                  <th key={m.monthKey} className="whitespace-nowrap px-3 py-2 text-right">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {METRICS.map((metric) => (
                <tr key={metric.key} className={metric.sub ? 'bg-slate-50/60' : undefined}>
                  <td
                    className={`sticky left-0 px-3 py-2 ${
                      metric.sub ? 'bg-slate-50/60 pl-6 text-xs text-slate-500' : 'bg-white font-medium text-slate-700'
                    }`}
                  >
                    {metric.label}
                  </td>
                  {months.map((m, i) => {
                    const value = metric.get(m)
                    const prevValue = i > 0 ? metric.get(months[i - 1]) : null
                    return (
                      <td key={m.monthKey} className="whitespace-nowrap px-3 py-2 text-right">
                        <div className={metric.sub ? 'text-xs text-slate-600' : 'text-slate-800'}>
                          {value != null ? metric.format(value) : '—'}
                        </div>
                        {i > 0 && value != null && prevValue != null && (
                          <div className="mt-0.5 flex justify-end">
                            <DeltaBadge delta={computeDelta(value, prevValue)} />
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
