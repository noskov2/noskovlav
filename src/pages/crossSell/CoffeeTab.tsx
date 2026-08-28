import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { resolveCoffeeVariants, idsOf } from '@/kpi/namedVariants'
import { productIdsInGroup } from '@/kpi/productGroups'
import { formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function CoffeeTab({ transactions, products, report, cashiersById }: CrossSellTabProps) {
  const groupIds = productIdsInGroup(products, 'cafea')
  const variants = resolveCoffeeVariants(products)
  const espressoIds = new Set([...idsOf(variants.espresso)].filter((id) => groupIds.has(id)))
  const espressoLungIds = new Set([...idsOf(variants.espressoLung)].filter((id) => groupIds.has(id)))
  const cappuccinoIds = new Set([...idsOf(variants.cappuccino)].filter((id) => groupIds.has(id)))
  const namedIds = new Set([...espressoIds, ...espressoLungIds, ...cappuccinoIds])
  const otherIds = new Set([...groupIds].filter((id) => !namedIds.has(id)))

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
      header: 'Cappuccino',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — Cappuccino`} lines={drillFor(r.cashier.id, cappuccinoIds)}>
          {formatNumber(r.coffee.cappuccino)}
        </DrillValue>
      ),
      sortValue: (r) => r.coffee.cappuccino,
    },
    {
      key: 'other',
      header: 'Alte cafele',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — Alte cafele`} lines={drillFor(r.cashier.id, otherIds)}>
          {formatNumber(r.coffee.other)}
        </DrillValue>
      ),
      sortValue: (r) => r.coffee.other,
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
        Cafea = toate produsele din grupul „Cafea” (Nomenclator → Grupuri pe categorie) — la fel ca totalul de pe
        Dashboard și Comparație lunară. Espresso / Espresso Lung / Cappuccino de mai jos sunt doar o împărțire după
        denumire a aceluiași total; ce nu se potrivește niciunuia intră la „Alte cafele”, nu dispare din total.{' '}
        {groupIds.size === 0 && (
          <span className="text-warn">Niciun produs nu e marcat în grupul „Cafea” — verifică Nomenclator → Grupuri pe categorie.</span>
        )}
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total stație</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(report.stationTotal.coffee.total)} cafele</p>
        <p className="text-xs text-slate-500">
          {formatNumber(report.stationTotal.coffee.espresso)} Espresso · {formatNumber(report.stationTotal.coffee.espressoLung)}{' '}
          Espresso Lung · {formatNumber(report.stationTotal.coffee.cappuccino)} Cappuccino ·{' '}
          {formatNumber(report.stationTotal.coffee.other)} Alte cafele
        </p>
      </div>
      <DataTable columns={columns} rows={report.cashiers} rowKey={(r) => r.cashier.id} defaultSortKey="total" />
    </div>
  )
}
