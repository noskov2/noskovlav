import type { Product, TransactionLine } from '@/types/domain'
import { groupIntoReceipts } from '@/kpi/receipts'
import { fuelProductIds } from '@/kpi/productGroups'
import { monthLabel } from '@/kpi/dateRanges'

// Exact category order and section rules reverse-engineered from the
// station's own "Statistici vânzări PECO" workbook (iulie 2026), so the
// generated report matches it 1:1. Any category not in this list is
// appended alphabetically at the end, so new categories still show up.
export const DEFAULT_CATEGORY_ORDER = [
  'Carburanti',
  'TIGARI',
  'TIGARI ELECTRONICE & DISPOZITIVE',
  'PRODUSE ALIMENTARE',
  'APA',
  'BAUTURI RACORITOARE',
  'COMPLEMENTARE',
  'ULEIURI',
  'DULCIURI',
  'BUTELII',
  'BERE',
  'BAUTURI SPIRTOASE',
  'VINURI',
  'Garantii SGR',
]

const SGR_CATEGORY = 'Garantii SGR'
const TOP_PRODUCTS_COUNT = 30
const TOP_PRODUCTS_EXCL_COUNT = 35
// Categories excluded from the "exceptie" top-products list & its % base.
const EXCLUDED_FROM_TOP_EXCL = new Set(['Carburanti', 'TIGARI', 'TIGARI ELECTRONICE & DISPOZITIVE'])

const WEEKDAY_ORDER = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică']

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toDDMMYYYY(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}

function romanianWeekday(dateStr: string): string {
  // getDay(): 0=Sun..6=Sat -> map to WEEKDAY_ORDER (Mon-first) index
  const jsDay = new Date(`${dateStr}T00:00:00`).getDay()
  return WEEKDAY_ORDER[(jsDay + 6) % 7]
}

function countReceipts(lines: TransactionLine[]): number {
  return groupIntoReceipts(lines, new Set()).length
}

export interface WeekdayRow {
  name: string
  value: number
  transactions: number
  days: number
  avgPerDay: number
  pct: number
}

export interface CategoryRow {
  category: string
  value: number
  transactions: number
  quantity: number
  pct: number
}

export interface ProductRow {
  rank: number
  name: string
  category: string
  quantity: number
  value: number
  pct: number
}

export interface DailyRow {
  dateLabel: string // DD.MM.YYYY
  weekday: string
  value: number
  transactions: number
  avgPerTransaction: number
}

export interface HourlyRow {
  label: string // "HH:00 – HH:00"
  value: number
  transactions: number
  avgPerTransaction: number
  pct: number
}

export interface MonthlyReportData {
  year: number
  month: number // 1-12
  title: string
  monthLabelText: string // "Iulie 2026"

  totalSales: number
  uniqueTransactions: number
  itemsSoldExclFuelSgr: number
  avgPerTransaction: number
  operationalDays: number
  avgPerDay: number

  byWeekday: WeekdayRow[]
  byCategory: CategoryRow[]

  topProducts: ProductRow[]
  topProductsTotal: { quantity: number; value: number; pct: number }

  topProductsExcl: ProductRow[]

  dailyEvolution: DailyRow[]
  dailyTotal: { value: number; transactions: number }
  dailyAverage: { value: number; transactions: number; avgPerTransaction: number }

  hourlyDistribution: HourlyRow[]
  hourlyTotal: { value: number; transactions: number }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function computeMonthlyReportData(
  year: number,
  month: number, // 1-12
  allTransactions: TransactionLine[],
  products: Product[],
): MonthlyReportData {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const monthPrefix = `${year}-${pad(month)}`
  const monthTx = allTransactions.filter((t) => t.date.startsWith(monthPrefix))

  const categoryOf = (t: TransactionLine): string => productsById.get(t.productId)?.category || t.categoryRaw || 'Necategorizat'
  const nameOf = (t: TransactionLine): string => productsById.get(t.productId)?.name || t.productRaw

  const totalSales = monthTx.reduce((s, t) => s + t.value, 0)
  const uniqueTransactions = countReceipts(monthTx)
  const fuelIds = fuelProductIds(products)
  const itemsSoldExclFuelSgr = monthTx.reduce((s, t) => {
    if (fuelIds.has(t.productId)) return s
    if (categoryOf(t) === SGR_CATEGORY) return s
    return s + t.quantity
  }, 0)
  const operationalDays = new Set(monthTx.map((t) => t.date)).size
  const avgPerTransaction = uniqueTransactions > 0 ? totalSales / uniqueTransactions : 0
  const avgPerDay = operationalDays > 0 ? totalSales / operationalDays : 0

  // ---- by weekday ----
  const byWeekdayMap = new Map<string, TransactionLine[]>()
  for (const name of WEEKDAY_ORDER) byWeekdayMap.set(name, [])
  for (const t of monthTx) byWeekdayMap.get(romanianWeekday(t.date))!.push(t)

  const byWeekday: WeekdayRow[] = WEEKDAY_ORDER.map((name) => {
    const lines = byWeekdayMap.get(name)!
    const value = lines.reduce((s, t) => s + t.value, 0)
    const transactions = countReceipts(lines)
    const days = new Set(lines.map((t) => t.date)).size
    return {
      name,
      value,
      transactions,
      days,
      avgPerDay: days > 0 ? value / days : 0,
      pct: totalSales > 0 ? value / totalSales : 0,
    }
  })

  // ---- by category ----
  const byCategoryMap = new Map<string, TransactionLine[]>()
  for (const t of monthTx) {
    const cat = categoryOf(t)
    const arr = byCategoryMap.get(cat)
    if (arr) arr.push(t)
    else byCategoryMap.set(cat, [t])
  }
  const seenCategories = Array.from(byCategoryMap.keys())
  const orderedCategories = [
    ...DEFAULT_CATEGORY_ORDER.filter((c) => byCategoryMap.has(c)),
    ...seenCategories.filter((c) => !DEFAULT_CATEGORY_ORDER.includes(c)).sort((a, b) => a.localeCompare(b)),
  ]
  const byCategory: CategoryRow[] = orderedCategories.map((category) => {
    const lines = byCategoryMap.get(category)!
    const value = lines.reduce((s, t) => s + t.value, 0)
    return {
      category,
      value,
      transactions: countReceipts(lines),
      quantity: lines.reduce((s, t) => s + t.quantity, 0),
      pct: totalSales > 0 ? value / totalSales : 0,
    }
  })

  // ---- top products (all categories) ----
  const byProductMap = new Map<string, { name: string; category: string; quantity: number; value: number }>()
  for (const t of monthTx) {
    const key = t.productId
    const acc = byProductMap.get(key) ?? { name: nameOf(t), category: categoryOf(t), quantity: 0, value: 0 }
    acc.quantity += t.quantity
    acc.value += t.value
    byProductMap.set(key, acc)
  }
  const allProductRows = Array.from(byProductMap.values()).sort((a, b) => b.value - a.value)

  const topProducts: ProductRow[] = allProductRows.slice(0, TOP_PRODUCTS_COUNT).map((p, i) => ({
    rank: i + 1,
    name: p.name,
    category: p.category,
    quantity: p.quantity,
    value: p.value,
    pct: totalSales > 0 ? p.value / totalSales : 0,
  }))
  const topProductsTotal = topProducts.reduce(
    (acc, p) => ({ quantity: acc.quantity + p.quantity, value: acc.value + p.value, pct: 0 }),
    { quantity: 0, value: 0, pct: 0 },
  )
  topProductsTotal.pct = totalSales > 0 ? topProductsTotal.value / totalSales : 0

  // ---- top products excluding fuel/tobacco ----
  const exclCategoriesValue = byCategory
    .filter((c) => EXCLUDED_FROM_TOP_EXCL.has(c.category) || c.category === SGR_CATEGORY)
    .reduce((s, c) => s + c.value, 0)
  const exclBase = totalSales - exclCategoriesValue

  const eligibleProductRows = allProductRows.filter((p) => !EXCLUDED_FROM_TOP_EXCL.has(p.category))
  const topProductsExcl: ProductRow[] = eligibleProductRows.slice(0, TOP_PRODUCTS_EXCL_COUNT).map((p, i) => ({
    rank: i + 1,
    name: p.name,
    category: p.category,
    quantity: p.quantity,
    value: p.value,
    pct: exclBase > 0 ? p.value / exclBase : 0,
  }))

  // ---- daily evolution (every calendar day of the month) ----
  const byDateMap = new Map<string, TransactionLine[]>()
  for (const t of monthTx) {
    const arr = byDateMap.get(t.date)
    if (arr) arr.push(t)
    else byDateMap.set(t.date, [t])
  }
  const nDays = daysInMonth(year, month)
  const dailyEvolution: DailyRow[] = []
  for (let d = 1; d <= nDays; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`
    const lines = byDateMap.get(dateStr) ?? []
    const value = lines.reduce((s, t) => s + t.value, 0)
    const transactions = countReceipts(lines)
    dailyEvolution.push({
      dateLabel: toDDMMYYYY(dateStr),
      weekday: romanianWeekday(dateStr),
      value,
      transactions,
      avgPerTransaction: transactions > 0 ? value / transactions : 0,
    })
  }
  const dailyTotal = {
    value: dailyEvolution.reduce((s, r) => s + r.value, 0),
    transactions: dailyEvolution.reduce((s, r) => s + r.transactions, 0),
  }
  const daysWithAnyRow = dailyEvolution.length || 1
  const dailyAverage = {
    value: dailyTotal.value / daysWithAnyRow,
    transactions: Math.round(dailyTotal.transactions / daysWithAnyRow),
    avgPerTransaction: dailyTotal.transactions > 0 ? dailyTotal.value / dailyTotal.transactions : 0,
  }

  // ---- hourly distribution (all 24 hours) ----
  const receipts = groupIntoReceipts(monthTx, new Set())
  const byHour: { value: number; transactions: number }[] = Array.from({ length: 24 }, () => ({
    value: 0,
    transactions: 0,
  }))
  for (const r of receipts) {
    const hour = parseInt(r.time.slice(0, 2), 10) || 0
    const bucket = byHour[Math.min(23, Math.max(0, hour))]
    bucket.value += r.totalValue
    bucket.transactions += 1
  }
  const hourlyDistribution: HourlyRow[] = byHour.map((b, h) => ({
    label: `${pad(h)}:00 – ${pad((h + 1) % 24 === 0 ? 24 : h + 1)}:00`,
    value: b.value,
    transactions: b.transactions,
    avgPerTransaction: b.transactions > 0 ? b.value / b.transactions : 0,
    pct: totalSales > 0 ? b.value / totalSales : 0,
  }))
  const hourlyTotal = {
    value: hourlyDistribution.reduce((s, r) => s + r.value, 0),
    transactions: hourlyDistribution.reduce((s, r) => s + r.transactions, 0),
  }

  const monthLabelText = monthLabel(`${year}-${pad(month)}-01`)

  return {
    year,
    month,
    title: `STATISTICI VÂNZĂRI PECO ${monthLabelText.toUpperCase()}`,
    monthLabelText,
    totalSales,
    uniqueTransactions,
    itemsSoldExclFuelSgr,
    avgPerTransaction,
    operationalDays,
    avgPerDay,
    byWeekday,
    byCategory,
    topProducts,
    topProductsTotal,
    topProductsExcl,
    dailyEvolution,
    dailyTotal,
    dailyAverage,
    hourlyDistribution,
    hourlyTotal,
  }
}
