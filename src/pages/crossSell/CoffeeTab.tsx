import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { resolveCoffeeVariants, idsOf } from '@/kpi/namedVariants'
import { formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function CoffeeTab({ transactions, products, report, cashiersById }: CrossSellTabProps) {
  const variants = resolveCoffeeVariants(products)
  const espressoIds = idsOf(variants.espresso)
  const espressoLungIds = idsOf(variants.espressoLung)
  const cappuccinoIds = idsOf(variants.cappuccinoLung)

  function drillFor(cashierId: string, ids: Set<string>) {
    return linesForCashier(transactions, cashierId, cashiersById).filter((t) => ids.has(t.productId))
  }

  const columns: DataTableColumn<CashierCrossSellRow>[] = [
    { key: 'name', header: 'Casier', render: (r) => r.cashier.name, sortValue: (r) => r.cashier.name },
    {
      key: 'espresso',
      header: 'Espresso',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — Espresso`} lines={drillFor(r.cashier.id, espressoIds)}>
          {formatNumber(r.coffee.espresso)}
        </DrillValue>
      ),
      sortValue: (r) => r.coffee.espresso,
    },
    {
      key: 'espressoLung',
      header: 'Espresso Lung',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — Espresso Lung`} lines={drillFor(r.cashier.id, espressoLungIds)}>
          {formatNumber(r.coffee.espressoLung)}
        </DrillValue>
      ),
      sortValue: (r) => r.coffee.espressoLung,
    },
    {
      key: 'cappuccino',
      header: 'Cappuccino Lung',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — Cappuccino Lung`} lines={drillFor(r.cashier.id, cappuccinoIds)}>
          {formatNumber(r.coffee.cappuccinoLung)}
        </DrillValue>
      ),
      sortValue: (r) => r.coffee.cappuccinoLung,
    },
    { key: 'total', header: 'Total cafele', align: 'right', render: (r) => <strong>{formatNumber(r.coffee.total)}</strong>, sortValue: (r) => r.coffee.total },
    { key: 'per100', header: 'Cafele/100 bonuri', align: 'right', render: (r) => formatNumber(r.coffee.per100Receipts, 1), sortValue: (r) => r.coffee.per100Receipts },
    { key: 'perShift', header: 'Cafele/tură', align: 'right', render: (r) => formatNumber(r.coffee.perShift, 1), sortValue: (r) => r.coffee.perShift },
    { key: 'perDay', header: 'Cafele/zi', align: 'right', render: (r) => formatNumber(r.coffee.perDay, 1), sortValue: (r) => r.coffee.perDay },
    {
      key: 'pctBonuri',
      header: '% bonuri cu cafea',
      align: 'right',
      render: (r) => formatPct(r.coffee.pctReceiptsWithCoffee),
      sortValue: (r) => r.coffee.pctReceiptsWithCoffee,
    },
  ]

  return (
    <div>
      <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Cafea = Espresso, Espresso Lung, Cappuccino Lung.{' '}
        {espressoIds.size + espressoLungIds.size + cappuccinoIds.size === 0 && (
          <span className="text-warn">Niciun produs din nomenclator nu se potrivește — verifică denumirile în Nomenclator.</span>
        )}
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total stație</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(report.stationTotal.coffee.total)} cafele</p>
        <p className="text-xs text-slate-500">
          {formatNumber(report.stationTotal.coffee.espresso)} Espresso · {formatNumber(report.stationTotal.coffee.espressoLung)}{' '}
          Espresso Lung · {formatNumber(report.stationTotal.coffee.cappuccinoLung)} Cappuccino Lung
        </p>
      </div>
      <DataTable columns={columns} rows={report.cashiers} rowKey={(r) => r.cashier.id} defaultSortKey="total" />
    </div>
  )
}
