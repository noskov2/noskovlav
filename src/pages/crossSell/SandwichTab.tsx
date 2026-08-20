import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { resolveSandwichVariants, idsOf, SANDWICH_VARIANT_LABELS } from '@/kpi/namedVariants'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function SandwichTab({ transactions, products, report, cashiersById }: CrossSellTabProps) {
  const variants = resolveSandwichVariants(products)
  const sets = {
    prosciuttoCotto: idsOf(variants.prosciuttoCotto),
    prosciuttoCrudo: idsOf(variants.prosciuttoCrudo),
    mozzarellaPesto: idsOf(variants.mozzarellaPesto),
    kebab: idsOf(variants.kebab),
    toast: idsOf(variants.toast),
  }

  function drillFor(cashierId: string, ids: Set<string>) {
    return linesForCashier(transactions, cashierId, cashiersById).filter((t) => ids.has(t.productId))
  }

  const columns: DataTableColumn<CashierCrossSellRow>[] = [
    { key: 'name', header: 'Casier', render: (r) => r.cashier.name, sortValue: (r) => r.cashier.name },
    ...(Object.keys(SANDWICH_VARIANT_LABELS) as (keyof typeof SANDWICH_VARIANT_LABELS)[]).map((key) => ({
      key,
      header: SANDWICH_VARIANT_LABELS[key],
      align: 'right' as const,
      render: (r: CashierCrossSellRow) => (
        <DrillValue title={`${r.cashier.name} — ${SANDWICH_VARIANT_LABELS[key]}`} lines={drillFor(r.cashier.id, sets[key])}>
          {formatNumber(r.sandwich[key])}
        </DrillValue>
      ),
      sortValue: (r: CashierCrossSellRow) => r.sandwich[key],
    })),
    { key: 'total', header: 'Total', align: 'right', render: (r) => <strong>{formatNumber(r.sandwich.total)}</strong>, sortValue: (r) => r.sandwich.total },
    { key: 'value', header: 'Valoare', align: 'right', render: (r) => formatLei(r.sandwich.value), sortValue: (r) => r.sandwich.value },
    { key: 'per100', header: 'Sandwich-uri/100 bonuri', align: 'right', render: (r) => formatNumber(r.sandwich.per100Receipts, 1), sortValue: (r) => r.sandwich.per100Receipts },
    { key: 'pct', header: '% bonuri cu sandwich', align: 'right', render: (r) => formatPct(r.sandwich.pctReceipts), sortValue: (r) => r.sandwich.pctReceipts },
  ]

  const allZero = Object.values(sets).every((s) => s.size === 0)

  return (
    <div>
      {allZero && (
        <p className="mb-4 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
          Niciun produs din nomenclator nu se potrivește sortimentelor de sandwich urmărite. Verifică denumirile
          produselor (ex: „Sandwich Prosciutto Cotto”).
        </p>
      )}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total stație</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(report.stationTotal.sandwich.total)} sandwich-uri</p>
        <p className="text-xs text-slate-500">{formatLei(report.stationTotal.sandwich.value)}</p>
      </div>
      <DataTable columns={columns} rows={report.cashiers} rowKey={(r) => r.cashier.id} defaultSortKey="total" />
    </div>
  )
}
