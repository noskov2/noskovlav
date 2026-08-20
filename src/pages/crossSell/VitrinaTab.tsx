import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { productIdsInGroup } from '@/kpi/productGroups'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function VitrinaTab({ transactions, products, report, cashiersById }: CrossSellTabProps) {
  const vitrinaIds = useMemo(() => productIdsInGroup(products, 'dulciuriVitrina'), [products])

  function drillFor(cashierId: string) {
    return linesForCashier(transactions, cashierId, cashiersById).filter((t) => vitrinaIds.has(t.productId))
  }

  const stationLines = drillFor('__station__')
  const productBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; value: number }>()
    for (const t of stationLines) {
      const acc = map.get(t.productId) ?? { name: t.productRaw, qty: 0, value: 0 }
      acc.qty += t.quantity
      acc.value += t.value
      map.set(t.productId, acc)
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty)
  }, [stationLines])

  const columns: DataTableColumn<CashierCrossSellRow>[] = [
    { key: 'name', header: 'Casier', render: (r) => r.cashier.name, sortValue: (r) => r.cashier.name },
    {
      key: 'receipts',
      header: 'Bonuri cu dulciuri vitrină',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — dulciuri vitrină`} lines={drillFor(r.cashier.id)}>
          {formatNumber(r.vitrina.receiptsWithVitrina)}
        </DrillValue>
      ),
      sortValue: (r) => r.vitrina.receiptsWithVitrina,
    },
    { key: 'pct', header: '% din bonurile lui', align: 'right', render: (r) => formatPct(r.vitrina.pctReceipts), sortValue: (r) => r.vitrina.pctReceipts },
    { key: 'qty', header: 'Cantitate', align: 'right', render: (r) => formatNumber(r.vitrina.quantity, 2), sortValue: (r) => r.vitrina.quantity },
    { key: 'value', header: 'Valoare', align: 'right', render: (r) => formatLei(r.vitrina.value), sortValue: (r) => r.vitrina.value },
  ]

  if (vitrinaIds.size === 0) {
    return (
      <p className="rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
        Niciun produs nu este marcat ca „Dulciuri Vitrină" în Nomenclator. Deschide Nomenclatorul și bifează grupul
        pentru produsele relevante.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total stație</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatNumber(report.stationTotal.vitrina.receiptsWithVitrina)} bonuri
          </p>
          <p className="text-xs text-slate-500">
            {formatNumber(report.stationTotal.vitrina.quantity, 2)} buc · {formatLei(report.stationTotal.vitrina.value)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Ce produse s-au vândut</p>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto text-sm scrollbar-thin">
            {productBreakdown.slice(0, 8).map((p) => (
              <li key={p.name} className="flex justify-between gap-2">
                <span className="truncate text-slate-700">{p.name}</span>
                <span className="text-slate-500">{formatNumber(p.qty, 2)} buc</span>
              </li>
            ))}
            {productBreakdown.length === 0 && <li className="text-slate-400">Nicio vânzare în perioadă.</li>}
          </ul>
        </div>
      </div>
      <DataTable columns={columns} rows={report.cashiers} rowKey={(r) => r.cashier.id} defaultSortKey="receipts" />
    </div>
  )
}
