import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import { TrendChart } from '@/components/charts/TrendChart'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { productIdsInGroup } from '@/kpi/productGroups'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function LemonadeTab({ transactions, products, report }: CrossSellTabProps) {
  const ids = useMemo(() => productIdsInGroup(products, 'limonadaCeai'), [products])

  function drillFor(cashierId: string) {
    return linesForCashier(transactions, cashierId).filter((t) => ids.has(t.productId))
  }

  const stationLines = drillFor('__station__')
  const dailySeries = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const t of stationLines) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.quantity)
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }))
  }, [stationLines])

  const columns: DataTableColumn<CashierCrossSellRow>[] = [
    { key: 'name', header: 'Casier', render: (r) => r.cashier.name, sortValue: (r) => r.cashier.name },
    {
      key: 'qty',
      header: 'Cantitate',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — limonade/ceaiuri`} lines={drillFor(r.cashier.id)}>
          {formatNumber(r.lemonade.quantity, 2)}
        </DrillValue>
      ),
      sortValue: (r) => r.lemonade.quantity,
    },
    { key: 'value', header: 'Valoare', align: 'right', render: (r) => formatLei(r.lemonade.value), sortValue: (r) => r.lemonade.value },
    {
      key: 'receipts',
      header: 'Bonuri cu limonadă/ceai',
      align: 'right',
      render: (r) => formatNumber(r.lemonade.receiptsWithLemonade),
      sortValue: (r) => r.lemonade.receiptsWithLemonade,
    },
    { key: 'pct', header: '% din bonuri', align: 'right', render: (r) => formatPct(r.lemonade.pctReceipts), sortValue: (r) => r.lemonade.pctReceipts },
  ]

  if (ids.size === 0) {
    return (
      <p className="rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
        Niciun produs nu este marcat ca „Limonadă/Ceai” în Nomenclator.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total stație</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">
          {formatNumber(report.stationTotal.lemonade.quantity, 2)} buc
        </p>
        <p className="text-xs text-slate-500">{formatLei(report.stationTotal.lemonade.value)}</p>
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Evoluție în timp</h3>
        <TrendChart data={dailySeries} valueFormatter={(v) => formatNumber(v, 1)} color="#0ea5e9" height={180} />
      </div>
      <DataTable columns={columns} rows={report.cashiers} rowKey={(r) => r.cashier.id} defaultSortKey="qty" />
    </div>
  )
}
