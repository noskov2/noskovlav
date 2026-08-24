import type { StockSnapshotLine, SupplierReceiptLine, TransactionLine } from '@/types/domain'
import { addDays, todayStr } from '@/kpi/dateRanges'
import { formatDateRo } from '@/lib/format'

export type ImportGapKind = 'sales' | 'stock' | 'purchases'

export interface ImportGap {
  kind: ImportGapKind
  icon: string
  severity: 'warn' | 'bad'
  text: string
}

// This app has no server and can't run in the background, so there is no
// real "push notification once a day" — what we can honestly offer is a
// live check, recomputed every time the app is open, of what's currently
// missing. The bell shows that check's result, not a scheduled alert.
const STALE_STOCK_DAYS = 7
const MAX_REPORTED_RANGES = 5

function groupConsecutiveDates(dates: string[]): { start: string; end: string }[] {
  const sorted = [...dates].sort()
  const ranges: { start: string; end: string }[] = []
  for (const d of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && addDays(last.end, 1) === d) last.end = d
    else ranges.push({ start: d, end: d })
  }
  return ranges
}

function rangeText(start: string, end: string): string {
  return start === end ? formatDateRo(start) : `${formatDateRo(start)} – ${formatDateRo(end)}`
}

export function computeImportGaps(
  transactions: TransactionLine[],
  stockSnapshots: StockSnapshotLine[],
  supplierReceipts: SupplierReceiptLine[],
): ImportGap[] {
  const gaps: ImportGap[] = []
  const today = todayStr()
  const yesterday = addDays(today, -1)

  // ---- Vânzări: găuri interne + coadă (de la ultima zi importată până ieri) ----
  if (transactions.length > 0) {
    const dateSet = new Set(transactions.map((t) => t.date))
    const dates = Array.from(dateSet)
    const minDate = dates.reduce((a, b) => (a < b ? a : b))
    const maxDate = dates.reduce((a, b) => (a > b ? a : b))

    const missing: string[] = []
    for (let d = minDate; d <= maxDate; d = addDays(d, 1)) {
      if (!dateSet.has(d)) missing.push(d)
    }
    const missingRanges = groupConsecutiveDates(missing)
    for (const r of missingRanges.slice(0, MAX_REPORTED_RANGES)) {
      gaps.push({
        kind: 'sales',
        icon: '💰',
        severity: 'bad',
        text: `Trebuie să imporți vânzările din ${rangeText(r.start, r.end)}.`,
      })
    }
    if (missingRanges.length > MAX_REPORTED_RANGES) {
      gaps.push({
        kind: 'sales',
        icon: '💰',
        severity: 'bad',
        text: `Și încă ${missingRanges.length - MAX_REPORTED_RANGES} perioade cu vânzări lipsă înainte de ${formatDateRo(maxDate)}.`,
      })
    }

    if (maxDate < yesterday) {
      gaps.push({
        kind: 'sales',
        icon: '💰',
        severity: 'bad',
        text: `Trebuie să imporți vânzările din ${rangeText(addDays(maxDate, 1), yesterday)}.`,
      })
    }
  }

  // ---- Stoc: fără import, sau învechit ----
  if (stockSnapshots.length === 0) {
    gaps.push({ kind: 'stock', icon: '📦', severity: 'warn', text: 'Nu ai importat niciodată stocul curent.' })
  } else {
    const latestAsOf = Math.max(...stockSnapshots.map((s) => s.asOf))
    const daysSince = Math.floor((Date.now() - latestAsOf) / 86400000)
    if (daysSince > STALE_STOCK_DAYS) {
      const d = new Date(latestAsOf)
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      gaps.push({
        kind: 'stock',
        icon: '📦',
        severity: 'warn',
        text: `Ultimul import de stoc este de acum ${daysSince} zile (${formatDateRo(localDate)}) — importă un stoc curent.`,
      })
    }
  }

  // ---- Achiziții/Furnizori: fără import, sau coadă (de la ultima zi
  // importată până ieri) — la fel ca la vânzări, fără prag de zile: dacă
  // ultima achiziție e mai veche decât ieri, apare mesajul chiar a doua zi.
  if (supplierReceipts.length === 0) {
    gaps.push({ kind: 'purchases', icon: '🚚', severity: 'warn', text: 'Nu ai importat niciodată achiziții/furnizori.' })
  } else {
    const latestDate = supplierReceipts.reduce((a, b) => (a.date > b.date ? a : b)).date
    if (latestDate < yesterday) {
      gaps.push({
        kind: 'purchases',
        icon: '🚚',
        severity: 'warn',
        text: `Trebuie să imporți achiziții/furnizori din ${rangeText(addDays(latestDate, 1), yesterday)}.`,
      })
    }
  }

  return gaps
}
