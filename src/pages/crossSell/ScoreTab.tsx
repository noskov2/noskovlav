import type { CrossSellTabProps } from '@/pages/crossSell/shared'
import { toScoreRow } from '@/kpi/cashierScore'
import { formatLei, formatNumber, formatPct } from '@/lib/format'

export function ScoreTab({ report }: CrossSellTabProps) {
  const rows = report.cashiers.map(toScoreRow).sort((a, b) => b.salesPerShift - a.salesPerShift)

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Indicatorii sunt normalizați per tură / 100 bonuri, ca să nu fie penalizați casierii care au lucrat mai
        puține ture într-o perioadă.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.cashier.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{r.cashier.name}</h3>
              <span className="text-xs text-slate-400">{r.shiftsWorked} ture</span>
            </div>
            <dl className="space-y-1 text-sm">
              <Row label="Vânzări/tură" value={formatLei(r.salesPerShift)} />
              <Row label="Bonuri/tură" value={formatNumber(r.receiptsPerShift, 1)} />
              <Row label="Bon mediu" value={formatLei(r.avgReceiptValue)} />
              <Row label="Cross-sell carburant" value={formatPct(r.crossSellPct)} />
              <Row label="Cafea" value={`${formatNumber(r.coffeeTotal)} buc (${formatNumber(r.coffeePer100, 1)}/100 bonuri)`} />
              <Row label="Sandwich-uri" value={`${formatNumber(r.sandwichTotal)} buc (${formatNumber(r.sandwichPer100, 1)}/100 bonuri)`} />
              <Row label="Dulciuri vitrină" value={`${formatNumber(r.vitrinaReceipts)} bonuri`} />
              <Row label="Limonade/ceai" value={`${formatNumber(r.lemonadeQty, 2)} buc`} />
            </dl>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">Nu există date de casieri pentru perioada selectată.</p>}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}
