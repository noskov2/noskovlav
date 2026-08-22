import type { CashierCrossSellRow } from '@/kpi/crossSell'
import type { ScoreWeights } from '@/types/domain'

// A cashier with only 1-2 shifts in the period shouldn't be ranked
// head-to-head with one who worked 20 — their per-shift/per-100-bonuri
// rates are too noisy to trust. Below this many shifts, the row still shows
// its raw stats but gets no composite score.
export const MIN_SHIFTS_FOR_SCORE = 5

export interface CashierScoreRow {
  cashier: CashierCrossSellRow['cashier']
  salesPerShift: number
  receiptsPerShift: number
  avgReceiptValue: number
  crossSellPct: number
  avgGoodsPerFuelReceipt: number // marfă/bon carburant
  coffeePer100: number
  sandwichPer100: number
  vitrinaPer100: number // dulciuri/100 bonuri (cantitate, nu doar bonuri-cu-dulciuri)
  lemonadePer100: number
  promoPer100: number // promoții/100 bonuri
  coffeeTotal: number
  sandwichTotal: number
  vitrinaReceipts: number
  lemonadeQty: number
  shiftsWorked: number
  score: number | null // 0-100, null dacă eșantionul e sub prag
  insufficientSample: boolean
}

// Cashiers can work very different numbers of shifts in a period, so the
// score deliberately leans on per-shift / per-100-bonuri rates rather than
// raw totals — a cashier who worked half as many shifts should not look
// "worse" just because their totals are smaller.
export function toScoreRow(row: CashierCrossSellRow): Omit<CashierScoreRow, 'score' | 'insufficientSample'> {
  const shifts = row.shiftsWorked || 1
  const receipts = row.totalReceipts || 1
  return {
    cashier: row.cashier,
    salesPerShift: row.totalSales / shifts,
    receiptsPerShift: row.totalReceipts / shifts,
    avgReceiptValue: row.avgReceiptValue,
    crossSellPct: row.crossSellPct,
    avgGoodsPerFuelReceipt: row.fuelReceipts > 0 ? row.goodsValueOnFuelReceipts / row.fuelReceipts : 0,
    coffeePer100: row.coffee.per100Receipts,
    sandwichPer100: row.sandwich.per100Receipts,
    vitrinaPer100: row.vitrina.per100Receipts,
    lemonadePer100: (row.lemonade.quantity / receipts) * 100,
    promoPer100: row.promo.per100Receipts,
    coffeeTotal: row.coffee.total,
    sandwichTotal: row.sandwich.total,
    vitrinaReceipts: row.vitrina.receiptsWithVitrina,
    lemonadeQty: row.lemonade.quantity,
    shiftsWorked: row.shiftsWorked,
  }
}

type ScoreMetricKey = keyof ScoreWeights

function normalize(value: number, min: number, max: number): number {
  return max > min ? ((value - min) / (max - min)) * 100 : 50
}

/**
 * Composite 0-100 score: each metric is min-max normalized across the
 * eligible cohort (cashiers with >= MIN_SHIFTS_FOR_SCORE), then combined by
 * `weights`. Cashiers below the shift threshold are excluded from the
 * normalization pool (so a single low-sample outlier can't stretch the
 * scale for everyone else) and get score=null + insufficientSample=true
 * instead of a misleading number.
 */
export function computeCashierScores(rows: CashierCrossSellRow[], weights: ScoreWeights): CashierScoreRow[] {
  const base = rows.map(toScoreRow)
  const eligible = base.filter((r) => r.shiftsWorked >= MIN_SHIFTS_FOR_SCORE)

  const metricKeys: ScoreMetricKey[] = [
    'salesPerShift',
    'crossSellPct',
    'coffeePer100',
    'sandwichPer100',
    'vitrinaPer100',
    'promoPer100',
  ]
  const ranges = Object.fromEntries(
    metricKeys.map((k) => {
      const values = eligible.map((r) => r[k])
      return [k, { min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0 }]
    }),
  ) as Record<ScoreMetricKey, { min: number; max: number }>

  const weightSum = metricKeys.reduce((s, k) => s + weights[k], 0) || 1

  return base.map((r) => {
    if (r.shiftsWorked < MIN_SHIFTS_FOR_SCORE) {
      return { ...r, score: null, insufficientSample: true }
    }
    const composite = metricKeys.reduce((sum, k) => {
      const { min, max } = ranges[k]
      return sum + normalize(r[k], min, max) * (weights[k] / weightSum)
    }, 0)
    return { ...r, score: Math.round(composite), insufficientSample: false }
  })
}
