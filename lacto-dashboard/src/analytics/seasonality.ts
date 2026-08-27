import { db } from '../db/db'
import { loadFilteredTransactions } from './filterRows'
import type { GlobalFilters } from './filters'

export type SeasonalityDimension = 'category' | 'product' | 'channel'

export interface SeasonalityMonth {
  year: number
  month: number
  key: string
}

export type Trend = 'crescator' | 'descrescator' | 'stabil'

export interface SeasonalityRow {
  id: number | null
  name: string
  valueByMonth: Record<string, number>
  totalValue: number
  avgValue: number
  stdDev: number
  coefficientOfVariation: number | null // %
  bestMonth: SeasonalityMonth | null
  worstMonth: SeasonalityMonth | null
  trend: Trend
}

export interface SeasonalityResult {
  months: SeasonalityMonth[]
  rows: SeasonalityRow[]
}

const NO_CATEGORY_LABEL = 'Fără categorie'
const UNIDENTIFIED_LABEL = 'Neidentificat'

/**
 * Analiză Sezonalitate (spec §16, §26): pivot lună × dimensiune (categorie/
 * produs/canal), cu trend și coeficient de variație per rând.
 */
export async function computeSeasonality(filters: GlobalFilters, dimension: SeasonalityDimension): Promise<SeasonalityResult> {
  const rows = await loadFilteredTransactions(filters)

  const [products, categories] = await Promise.all([db.products.toArray(), db.categories.toArray()])
  const productCategoryById = new Map(products.map((p) => [p.id!, p.categoryId ?? null]))
  const categoryNameById = new Map(categories.map((c) => [c.id!, c.name]))
  const productNameById = new Map(products.map((p) => [p.id!, p.canonicalName]))

  const monthsSet = new Map<string, SeasonalityMonth>()
  const acc = new Map<string, { id: number | null; name: string; byMonth: Map<string, number> }>()

  for (const t of rows) {
    const monthKey = `${t.year}-${String(t.month).padStart(2, '0')}`
    if (!monthsSet.has(monthKey)) monthsSet.set(monthKey, { year: t.year, month: t.month, key: monthKey })

    let dimId: number | null
    let dimName: string
    if (dimension === 'channel') {
      dimId = null
      dimName = t.channel
    } else if (dimension === 'product') {
      dimId = t.canonicalProductId
      dimName = dimId !== null ? (productNameById.get(dimId) ?? t.productRaw) : UNIDENTIFIED_LABEL
    } else {
      const categoryId = t.canonicalProductId !== null ? (productCategoryById.get(t.canonicalProductId) ?? null) : null
      dimId = categoryId
      dimName = categoryId !== null ? (categoryNameById.get(categoryId) ?? 'Categorie ștearsă') : NO_CATEGORY_LABEL
    }

    const dimKey = dimension === 'channel' ? `name:${dimName}` : `id:${dimId}`
    let row = acc.get(dimKey)
    if (!row) {
      row = { id: dimId, name: dimName, byMonth: new Map() }
      acc.set(dimKey, row)
    }
    row.byMonth.set(monthKey, (row.byMonth.get(monthKey) ?? 0) + (t.value ?? 0))
  }

  const months = [...monthsSet.values()].sort((a, b) => a.key.localeCompare(b.key))

  const resultRows: SeasonalityRow[] = [...acc.values()].map((r) => {
    const values = months.map((m) => r.byMonth.get(m.key) ?? 0)
    const totalValue = values.reduce((s, v) => s + v, 0)
    const avgValue = values.length > 0 ? totalValue / values.length : 0
    const variance = values.length > 0 ? values.reduce((s, v) => s + (v - avgValue) ** 2, 0) / values.length : 0
    const stdDev = Math.sqrt(variance)
    const coefficientOfVariation = avgValue > 0 ? (stdDev / avgValue) * 100 : null

    let bestMonth: SeasonalityMonth | null = null
    let worstMonth: SeasonalityMonth | null = null
    let bestVal = -Infinity
    let worstVal = Infinity
    months.forEach((m, i) => {
      const v = values[i]
      if (v > bestVal) {
        bestVal = v
        bestMonth = m
      }
      if (v < worstVal) {
        worstVal = v
        worstMonth = m
      }
    })

    let trend: Trend = 'stabil'
    if (months.length >= 2) {
      const mid = Math.floor(months.length / 2)
      const firstHalf = values.slice(0, mid)
      const secondHalf = values.slice(months.length - mid)
      const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / Math.max(1, firstHalf.length)
      const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / Math.max(1, secondHalf.length)
      const threshold = Math.max(1, firstAvg * 0.05)
      if (secondAvg - firstAvg > threshold) trend = 'crescator'
      else if (firstAvg - secondAvg > threshold) trend = 'descrescator'
    }

    const valueByMonth: Record<string, number> = {}
    months.forEach((m, i) => {
      valueByMonth[m.key] = values[i]
    })

    return { id: r.id, name: r.name, valueByMonth, totalValue, avgValue, stdDev, coefficientOfVariation, bestMonth, worstMonth, trend }
  })

  resultRows.sort((a, b) => b.totalValue - a.totalValue)

  return { months, rows: resultRows }
}
