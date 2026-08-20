import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts } from '@/kpi/receipts'
import { fuelProductIds } from '@/kpi/productGroups'
import { monthLabel } from '@/kpi/dateRanges'

// Structure reverse-engineered cell-by-cell from the station's own
// "Raport bonuri" workbook (iulie 2026): one row per calendar day, newest
// day first, counting bonuri (receipts) in three buckets — pure fuel, pure
// goods, and mixed (both on the same bon) — plus a TOTAL / MEDIE-ZI / ZI-MAX
// summary block.

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toDotDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${y}.${m}.${d}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export interface DailyReceiptsRow {
  dateLabel: string // YYYY.MM.DD
  fuelOnly: number
  goodsOnly: number
  mixed: number
  total: number
  pctMixed: number // 0..1
}

export interface DailyReceiptsData {
  year: number
  month: number
  title: string
  monthLabelText: string
  rows: DailyReceiptsRow[] // newest day first
  totals: { fuelOnly: number; goodsOnly: number; mixed: number; total: number; pctMixed: number }
  avgPerDay: { fuelOnly: number; goodsOnly: number; mixed: number; total: number }
  maxDay: { fuelOnly: number; goodsOnly: number; mixed: number; total: number }
}

export function computeDailyReceiptsData(
  year: number,
  month: number,
  allTransactions: TransactionLine[],
  products: Product[],
): DailyReceiptsData {
  const monthPrefix = `${year}-${pad(month)}`
  const monthTx = allTransactions.filter((t) => t.date.startsWith(monthPrefix))
  const fuelIds = fuelProductIds(products)

  const byDate = new Map<string, TransactionLine[]>()
  for (const t of monthTx) {
    const arr = byDate.get(t.date)
    if (arr) arr.push(t)
    else byDate.set(t.date, [t])
  }

  const nDays = daysInMonth(year, month)
  const rows: DailyReceiptsRow[] = []
  for (let d = nDays; d >= 1; d--) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`
    const lines = byDate.get(dateStr) ?? []
    const receipts = groupIntoReceipts(lines, fuelIds)
    let fuelOnly = 0
    let goodsOnly = 0
    let mixed = 0
    for (const r of receipts) {
      if (r.hasFuel && r.hasGoods) mixed++
      else if (r.hasFuel) fuelOnly++
      else goodsOnly++
    }
    const total = fuelOnly + goodsOnly + mixed
    rows.push({
      dateLabel: toDotDate(dateStr),
      fuelOnly,
      goodsOnly,
      mixed,
      total,
      pctMixed: total > 0 ? mixed / total : 0,
    })
  }

  const sum = (pick: (r: DailyReceiptsRow) => number) => rows.reduce((s, r) => s + pick(r), 0)
  const totals = {
    fuelOnly: sum((r) => r.fuelOnly),
    goodsOnly: sum((r) => r.goodsOnly),
    mixed: sum((r) => r.mixed),
    total: sum((r) => r.total),
    pctMixed: 0,
  }
  totals.pctMixed = totals.total > 0 ? totals.mixed / totals.total : 0

  const n = rows.length || 1
  const round1 = (x: number) => Math.round(x * 10) / 10
  const avgPerDay = {
    fuelOnly: round1(totals.fuelOnly / n),
    goodsOnly: round1(totals.goodsOnly / n),
    mixed: round1(totals.mixed / n),
    total: round1(totals.total / n),
  }
  const maxDay = {
    fuelOnly: rows.reduce((m, r) => Math.max(m, r.fuelOnly), 0),
    goodsOnly: rows.reduce((m, r) => Math.max(m, r.goodsOnly), 0),
    mixed: rows.reduce((m, r) => Math.max(m, r.mixed), 0),
    total: rows.reduce((m, r) => Math.max(m, r.total), 0),
  }

  const monthLabelText = monthLabel(`${year}-${pad(month)}-01`)

  return {
    year,
    month,
    title: `RAPORT BONURI ZILNICE — ${monthLabelText.toUpperCase()}`,
    monthLabelText,
    rows,
    totals,
    avgPerDay,
    maxDay,
  }
}
