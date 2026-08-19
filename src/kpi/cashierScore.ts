import type { CashierCrossSellRow } from '@/kpi/crossSell'

export interface CashierScoreRow {
  cashier: CashierCrossSellRow['cashier']
  salesPerShift: number
  receiptsPerShift: number
  avgReceiptValue: number
  crossSellPct: number
  coffeePer100: number
  sandwichPer100: number
  vitrinaPer100: number
  lemonadePer100: number
  coffeeTotal: number
  sandwichTotal: number
  vitrinaReceipts: number
  lemonadeQty: number
  shiftsWorked: number
}

// Cashiers can work very different numbers of shifts in a period, so the
// score deliberately leans on per-shift / per-100-bonuri rates rather than
// raw totals — a cashier who worked half as many shifts should not look
// "worse" just because their totals are smaller.
export function toScoreRow(row: CashierCrossSellRow): CashierScoreRow {
  const shifts = row.shiftsWorked || 1
  const receipts = row.totalReceipts || 1
  return {
    cashier: row.cashier,
    salesPerShift: row.totalSales / shifts,
    receiptsPerShift: row.totalReceipts / shifts,
    avgReceiptValue: row.avgReceiptValue,
    crossSellPct: row.crossSellPct,
    coffeePer100: row.coffee.per100Receipts,
    sandwichPer100: row.sandwich.per100Receipts,
    vitrinaPer100: (row.vitrina.receiptsWithVitrina / receipts) * 100,
    lemonadePer100: (row.lemonade.quantity / receipts) * 100,
    coffeeTotal: row.coffee.total,
    sandwichTotal: row.sandwich.total,
    vitrinaReceipts: row.vitrina.receiptsWithVitrina,
    lemonadeQty: row.lemonade.quantity,
    shiftsWorked: row.shiftsWorked,
  }
}
