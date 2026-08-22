import type { CrossSellTabProps } from '@/pages/crossSell/shared'
import { computeCashierScores, toScoreRow, MIN_SHIFTS_FOR_SCORE } from '@/kpi/cashierScore'
import { defaultScoreWeights } from '@/types/domain'
import { computeDelta } from '@/kpi/monthComparison'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { formatLei, formatNumber, formatPct } from '@/lib/format'

function scoreTone(score: number): string {
  if (score >= 70) return 'bg-good/10 text-good'
  if (score >= 45) return 'bg-warn/10 text-warn'
  return 'bg-bad/10 text-bad'
}

export function ScoreTab({ report, prevReport, cashiersById: _cashiersById, scoreWeights }: CrossSellTabProps) {
  const weights = scoreWeights ?? defaultScoreWeights
  const rows = computeCashierScores(report.cashiers, weights).sort((a, b) => b.salesPerShift - a.salesPerShift)
  const stationRef = toScoreRow(report.stationTotal)
  const prevByCashierId = new Map((prevReport?.cashiers ?? []).map((r) => [r.cashier.id, r]))

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Indicatorii sunt normalizați per tură / 100 bonuri, ca să nu fie penalizați casierii care au lucrat mai
        puține ture într-o perioadă. Scorul 0-100 combină indicatorii normalizați (min-max) față de ceilalți casieri
        cu cel puțin {MIN_SHIFTS_FOR_SCORE} ture — ponderile sunt configurabile în Setări.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const prev = prevByCashierId.get(r.cashier.id)
          const prevScoreRow = prev ? toScoreRow(prev) : null
          return (
            <div key={r.cashier.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{r.cashier.name}</h3>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">{r.shiftsWorked} ture</span>
                  {r.score != null ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${scoreTone(r.score)}`}>{r.score}</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500" title={`Sub ${MIN_SHIFTS_FOR_SCORE} ture`}>
                      Eșantion insuficient
                    </span>
                  )}
                </div>
              </div>
              <dl className="space-y-1 text-sm">
                <Row
                  label="Vânzări/tură"
                  value={formatLei(r.salesPerShift)}
                  vsStation={computeDelta(r.salesPerShift, stationRef.salesPerShift)}
                  vsPrev={prevScoreRow ? computeDelta(r.salesPerShift, prevScoreRow.salesPerShift) : null}
                />
                <Row label="Bonuri/tură" value={formatNumber(r.receiptsPerShift, 1)} />
                <Row label="Bon mediu" value={formatLei(r.avgReceiptValue)} />
                <Row
                  label="Cross-sell carburant"
                  value={formatPct(r.crossSellPct)}
                  vsStation={computeDelta(r.crossSellPct, stationRef.crossSellPct)}
                  vsPrev={prevScoreRow ? computeDelta(r.crossSellPct, prevScoreRow.crossSellPct) : null}
                />
                <Row label="Marfă/bon carburant" value={formatLei(r.avgGoodsPerFuelReceipt)} />
                <Row label="Cafea" value={`${formatNumber(r.coffeeTotal)} buc (${formatNumber(r.coffeePer100, 1)}/100 bonuri)`} />
                <Row label="Sandwich-uri" value={`${formatNumber(r.sandwichTotal)} buc (${formatNumber(r.sandwichPer100, 1)}/100 bonuri)`} />
                <Row label="Dulciuri vitrină" value={`${formatNumber(r.vitrinaPer100, 1)}/100 bonuri`} />
                <Row label="Promoții" value={`${formatNumber(r.promoPer100, 1)}/100 bonuri`} />
                <Row label="Limonade/ceai" value={`${formatNumber(r.lemonadeQty, 2)} buc`} />
              </dl>
            </div>
          )
        })}
        {rows.length === 0 && <p className="text-sm text-slate-400">Nu există date de casieri pentru perioada selectată.</p>}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  vsStation,
  vsPrev,
}: {
  label: string
  value: string
  vsStation?: ReturnType<typeof computeDelta>
  vsPrev?: ReturnType<typeof computeDelta> | null
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium text-slate-800">
        {value}
        {vsStation && (
          <span title="vs. media stației">
            <DeltaBadge delta={vsStation} />
          </span>
        )}
        {vsPrev && (
          <span title="vs. luna precedentă (același casier)" className="opacity-70">
            <DeltaBadge delta={vsPrev} />
          </span>
        )}
      </dd>
    </div>
  )
}
