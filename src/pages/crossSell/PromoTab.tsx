import { useMemo } from 'react'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { computePromoLineLabels } from '@/kpi/promoLines'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { linesForCashier, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function PromoTab({ transactions, products, report, cashiersById }: CrossSellTabProps) {
  const promoLabelsById = useMemo(() => computePromoLineLabels(transactions, products), [transactions, products])

  function drillFor(cashierId: string) {
    return linesForCashier(transactions, cashierId, cashiersById).filter((t) => promoLabelsById.has(t.id))
  }

  const configured = report.stationTotal.promo.lineCount > 0 || transactions.some((t) => !!t.promotionRaw)

  const columns: DataTableColumn<CashierCrossSellRow>[] = [
    { key: 'name', header: 'Casier / Echipă', render: (r) => r.cashier.name, sortValue: (r) => r.cashier.name },
    {
      key: 'lines',
      header: 'Linii promoții',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.cashier.name} — linii promoții`} lines={drillFor(r.cashier.id)}>
          {formatNumber(r.promo.lineCount)}
        </DrillValue>
      ),
      sortValue: (r) => r.promo.lineCount,
    },
    {
      key: 'pct',
      header: '% din bonurile lui',
      align: 'right',
      render: (r) => formatPct(r.promo.pctReceipts),
      sortValue: (r) => r.promo.pctReceipts,
    },
    { key: 'value', header: 'Valoare', align: 'right', render: (r) => formatLei(r.promo.value), sortValue: (r) => r.promo.value },
  ]

  // Pivot: one row per promotion label, one column per row already shown
  // above (casier sau echipă, în funcție de comutatorul „Pe casier / Pe
  // echipă"), value = valoarea vândută pe acea promoție de acel casier/echipă.
  const byLabel = new Map<string, Map<string, number>>()
  for (const row of report.cashiers) {
    const lines = drillFor(row.cashier.id)
    for (const l of lines) {
      const label = promoLabelsById.get(l.id) ?? l.productRaw
      let byGroup = byLabel.get(label)
      if (!byGroup) {
        byGroup = new Map()
        byLabel.set(label, byGroup)
      }
      byGroup.set(row.cashier.id, (byGroup.get(row.cashier.id) ?? 0) + l.value)
    }
  }
  const pivotRows = Array.from(byLabel.entries())
    .map(([label, byGroup]) => {
      const values = report.cashiers.map((row) => byGroup.get(row.cashier.id) ?? 0)
      const total = values.reduce((s, v) => s + v, 0)
      return { label, values, total }
    })
    .sort((a, b) => b.total - a.total)

  if (!configured) {
    return (
      <p className="rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
        Nicio sursă de promoții configurată încă. Mapează coloana „Promoție" la Import date → Mapare coloane, sau
        bifează o categorie ca „Promoții" în Nomenclator → Grupuri pe categorie, ca să apară aici.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total stație</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(report.stationTotal.promo.lineCount)} linii</p>
          <p className="text-xs text-slate-500">{formatLei(report.stationTotal.promo.value)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bonuri cu promoție</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(report.stationTotal.promo.receiptsWithPromo)}</p>
          <p className="text-xs text-slate-500">{formatPct(report.stationTotal.promo.pctReceipts)} din total bonuri</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipuri de promoții</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatNumber(pivotRows.length)}</p>
        </div>
      </div>

      <DataTable columns={columns} rows={report.cashiers} rowKey={(r) => r.cashier.id} defaultSortKey="lines" />

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Valoare vândută pe fiecare promoție</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Promoție</th>
              {report.cashiers.map((r) => (
                <th key={r.cashier.id} className="px-3 py-2 text-right">
                  {r.cashier.name}
                </th>
              ))}
              <th className="px-3 py-2 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pivotRows.map((row) => (
              <tr key={row.label}>
                <td className="px-3 py-1.5 font-medium text-slate-800">{row.label}</td>
                {row.values.map((v, i) => (
                  <td key={report.cashiers[i].cashier.id} className="px-3 py-1.5 text-right text-slate-600">
                    {v > 0 ? formatLei(v) : '—'}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-semibold text-slate-900">{formatLei(row.total)}</td>
              </tr>
            ))}
            {pivotRows.length === 0 && (
              <tr>
                <td colSpan={report.cashiers.length + 2} className="px-3 py-4 text-center text-slate-400">
                  Nicio linie de promoție în perioada selectată.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
