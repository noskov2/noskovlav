import type { SlowMoverRow } from '@/kpi/slowMovers'
import { formatNumber } from '@/lib/format'

// Turns a slow-mover row into a ready-to-read action sentence instead of
// just a "suprastoc"/"vânzare slabă" label — only when there's actual stock
// sitting idle (no point recommending an action on a product that's simply
// out of stock). The station doesn't track product expiry dates, so unlike
// a system that does, this can only project "stock will likely still be
// sitting there in N days," not "before it expires."
export function buildStockActionNote(row: SlowMoverRow, periodDays: number): string | null {
  const stock = row.product.currentStock
  if (stock == null || stock <= 0) return null
  if (row.classification === 'activ') return null

  if (row.classification === 'fara-vanzare') {
    return `Ai ${formatNumber(stock)} bucăți din ${row.product.name}, fără nicio vânzare în ultimele ${periodDays} zile. Stoc complet blocat — recomandare: promoție sau transfer către altă locație.`
  }

  if (row.avgPerDay <= 0) return null
  const runwayDays = Math.round(stock / row.avgPerDay)
  return `Ai ${formatNumber(stock)} bucăți din ${row.product.name}, se vând ${formatNumber(row.avgPerDay, 2)}/zi. La acest ritm, probabil vor mai rămâne aproximativ ${runwayDays} zile de stoc — recomandare: promoție sau transfer dacă nu ai nevoie de atâta acoperire.`
}
