import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { resolveSandwichVariants, idsOf, SANDWICH_VARIANT_LABELS } from '@/kpi/namedVariants'
import { productIdsInGroup } from '@/kpi/productGroups'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function SandwichTab({ transactions, products, report, cashiersById }: CrossSellTabProps) {
  const groupIds = productIdsInGroup(products, 'sandwich')
  const variants = resolveSandwichVariants(products)
  const sets = {
    prosciuttoCotto: new Set([...idsOf(variants.prosciuttoCotto)].filter((id) => groupIds.has(id))),
    prosciuttoCrudo: new Set([...idsOf(variants.prosciuttoCrudo)].filter((id) => groupIds.has(id))),
    mozzarellaPesto: new Set([...idsOf(variants.mozzarellaPesto)].filter((id) => groupIds.has(id))),
    kebab: new Set([...idsOf(variants.kebab)].filter((id) => groupIds.has(id))),
    toast: new Set([...idsOf(variants.toast)].filter((id) => groupIds.has(id))),
  }
  const namedIds = new Set(Object.values(sets).flatMap((s) => [...s]))
  const otherIds = new Set([...groupIds].filter((id) => !namedIds.has(id)))

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
    {
      key: 'other',
      header: 'Alte sandwich-uri',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — Alte sandwich-uri`} lines={drillFor(r.cashier.id, otherIds)}>
          {formatNumber(r.sandwich.other)}
        </DrillValue>
      ),
      sortValue: (r) => r.sandwich.other,
    },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <strong>{formatNumber(r.sandwich.total)}</strong>, sortValue: (r) => r.sandwich.total },
    { key: 'value', header: 'Valoare', align: 'right', render: (r) => formatLei(r.sandwich.value), sortValue: (r) => r.sandwich.value },
    { key: 'per100', header: 'Sandwich-uri/100 bonuri', align: 'right', render: (r) => formatNumber(r.sandwich.per100Receipts, 1), sortValue: (r) => r.sandwich.per100Receipts },
    { key: 'pct', header: '% bonuri cu sandwich', align: 'right', render: (r) => formatPct(r.sandwich.pctReceipts), sortValue: (r) => r.sandwich.pctReceipts },
  ]

  return (
    <div>
      <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Total = toate produsele din grupul „Sandwich” (Nomenclator → Grupuri pe categorie) — la fel ca totalul de pe
        Dashboard și Comparație lunară. Coloanele de mai sus sunt doar o împărțire după denumire; ce nu se potrivește
        niciunui sortiment cunoscut intră la „Alte sandwich-uri”.
      </p>
      {groupIds.size === 0 && (
        <p className="mb-4 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
          Niciun produs nu e marcat în grupul „Sandwich” — verifică Nomenclator → Grupuri pe categorie.
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
