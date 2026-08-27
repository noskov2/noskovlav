import { db } from '../db/db'
import { computeAggregate } from './aggregate'
import { computeClientDynamics } from './clientDynamics'
import { loadFilteredTransactions } from './filterRows'
import type { GlobalFilters } from './filters'
import { formatCurrency, formatPercent } from '../lib/ro-format'

export type AlertSeverity = 'red' | 'amber' | 'green'

export interface Alert {
  severity: AlertSeverity
  message: string
  link?: { type: 'client' | 'product'; id: number }
}

const SIGNIFICANT_GROWTH_THRESHOLD = 20 // %
const INACTIVITY_DAYS_THRESHOLD = 45
const PRICE_BELOW_AVG_THRESHOLD = 10 // %
const MAX_PER_CATEGORY = 3

/**
 * Alerte & Insight-uri (spec §27) — calculate integral din date, fără texte
 * hardcodate. Fiecare regulă produce cel mult câteva alerte (cele mai
 * semnificative), ca pagina să rămână utilă, nu zgomotoasă.
 */
export async function computeAlerts(filters: GlobalFilters): Promise<Alert[]> {
  const alerts: Alert[] = []

  const dynamics = await computeClientDynamics(filters, SIGNIFICANT_GROWTH_THRESHOLD)
  if (dynamics) {
    const grown = dynamics.rows.filter((r) => r.status === 'crescut').sort((a, b) => (b.diffPercent ?? 0) - (a.diffPercent ?? 0))
    for (const r of grown.slice(0, MAX_PER_CATEGORY)) {
      alerts.push({
        severity: 'green',
        message: `${r.name}: vânzări ${formatPercent(r.diffPercent)} față de perioada de comparație.`,
        link: { type: 'client', id: r.id },
      })
    }

    const declined = dynamics.rows.filter((r) => r.status === 'scazut').sort((a, b) => (a.diffPercent ?? 0) - (b.diffPercent ?? 0))
    for (const r of declined.slice(0, MAX_PER_CATEGORY)) {
      alerts.push({
        severity: 'red',
        message: `${r.name}: vânzări ${formatPercent(r.diffPercent)} față de perioada de comparație.`,
        link: { type: 'client', id: r.id },
      })
    }

    const lost = dynamics.rows.filter((r) => r.status === 'pierdut').sort((a, b) => b.previousValue - a.previousValue)
    for (const r of lost.slice(0, MAX_PER_CATEGORY)) {
      alerts.push({
        severity: 'red',
        message: `${r.name}: client pierdut — zero vânzări în perioada curentă (avea ${formatCurrency(r.previousValue)} în perioada de comparație).`,
        link: { type: 'client', id: r.id },
      })
    }
  }

  // Clienți inactivi (fără achiziții recente), pe baza istoricului complet.
  const allByClient = await db.transactions.orderBy('date').toArray()
  const lastPurchaseByClient = new Map<number, { date: string; totalValue: number }>()
  for (const t of allByClient) {
    if (t.canonicalClientId === null) continue
    const entry = lastPurchaseByClient.get(t.canonicalClientId)
    if (!entry) lastPurchaseByClient.set(t.canonicalClientId, { date: t.date, totalValue: t.value ?? 0 })
    else {
      entry.totalValue += t.value ?? 0
      if (t.date > entry.date) entry.date = t.date
    }
  }
  const clientNames = new Map((await db.clients.toArray()).map((c) => [c.id!, c.canonicalName]))
  const todayIso = filters.period.end
  const inactive = [...lastPurchaseByClient.entries()]
    .map(([id, e]) => ({ id, ...e, days: Math.round((new Date(todayIso).getTime() - new Date(e.date).getTime()) / 86400000) }))
    .filter((e) => e.days >= INACTIVITY_DAYS_THRESHOLD)
    .sort((a, b) => b.totalValue - a.totalValue)
  for (const c of inactive.slice(0, MAX_PER_CATEGORY)) {
    alerts.push({
      severity: 'amber',
      message: `${clientNames.get(c.id) ?? `#${c.id}`}: nu a mai cumpărat de ${c.days} zile.`,
      link: { type: 'client', id: c.id },
    })
  }

  // Produse care au pierdut clienți față de perioada de comparație.
  if (filters.comparisonPeriod) {
    const [currentTx, previousTx, products] = await Promise.all([
      loadFilteredTransactions(filters),
      loadFilteredTransactions({ ...filters, period: filters.comparisonPeriod }),
      db.products.toArray(),
    ])
    const productNames = new Map(products.map((p) => [p.id!, p.canonicalName]))
    const currentClientsByProduct = new Map<number, Set<number>>()
    const previousClientsByProduct = new Map<number, Set<number>>()
    for (const t of currentTx) {
      if (t.canonicalProductId === null || t.canonicalClientId === null) continue
      if (!currentClientsByProduct.has(t.canonicalProductId)) currentClientsByProduct.set(t.canonicalProductId, new Set())
      currentClientsByProduct.get(t.canonicalProductId)!.add(t.canonicalClientId)
    }
    for (const t of previousTx) {
      if (t.canonicalProductId === null || t.canonicalClientId === null) continue
      if (!previousClientsByProduct.has(t.canonicalProductId)) previousClientsByProduct.set(t.canonicalProductId, new Set())
      previousClientsByProduct.get(t.canonicalProductId)!.add(t.canonicalClientId)
    }
    const productLosses = [...previousClientsByProduct.entries()]
      .map(([productId, prevSet]) => {
        const curSet = currentClientsByProduct.get(productId) ?? new Set()
        const lostCount = [...prevSet].filter((id) => !curSet.has(id)).length
        return { productId, lostCount }
      })
      .filter((p) => p.lostCount > 0)
      .sort((a, b) => b.lostCount - a.lostCount)
    for (const p of productLosses.slice(0, MAX_PER_CATEGORY)) {
      alerts.push({
        severity: 'red',
        message: `${productNames.get(p.productId) ?? `#${p.productId}`}: a pierdut ${p.lostCount} client${p.lostCount > 1 ? 'i' : ''} față de perioada de comparație.`,
        link: { type: 'product', id: p.productId },
      })
    }

    // Canalul care generează cea mai mare parte din creșterea companiei.
    const [current, previous] = await Promise.all([computeAggregate(filters), computeAggregate({ ...filters, period: filters.comparisonPeriod })])
    const companyGrowth = current.totalValue - previous.totalValue
    if (companyGrowth > 0) {
      const previousByChannel = new Map(previous.byChannel.map((c) => [c.name, c.value]))
      const channelShares = current.byChannel.map((c) => ({
        name: c.name,
        growth: c.value - (previousByChannel.get(c.name) ?? 0),
      }))
      const topChannel = channelShares.sort((a, b) => b.growth - a.growth)[0]
      if (topChannel && topChannel.growth > 0) {
        const share = (topChannel.growth / companyGrowth) * 100
        if (share >= 50) {
          alerts.push({ severity: 'green', message: `Canalul ${topChannel.name} generează ${share.toFixed(0)}% din creșterea companiei.` })
        }
      }
    }
  }

  // Prețuri mult sub media produsului, la nivel de client.
  const currentTxForPrice = await loadFilteredTransactions(filters)
  const productPriceSum = new Map<number, { value: number; quantity: number }>()
  for (const t of currentTxForPrice) {
    if (t.canonicalProductId === null || !(t.quantity && t.quantity > 0)) continue
    const acc = productPriceSum.get(t.canonicalProductId) ?? { value: 0, quantity: 0 }
    acc.value += t.value ?? 0
    acc.quantity += t.quantity
    productPriceSum.set(t.canonicalProductId, acc)
  }
  const clientProductSum = new Map<string, { value: number; quantity: number; productId: number; clientId: number }>()
  for (const t of currentTxForPrice) {
    if (t.canonicalProductId === null || t.canonicalClientId === null || !(t.quantity && t.quantity > 0)) continue
    const key = `${t.canonicalClientId}:${t.canonicalProductId}`
    const acc = clientProductSum.get(key) ?? { value: 0, quantity: 0, productId: t.canonicalProductId, clientId: t.canonicalClientId }
    acc.value += t.value ?? 0
    acc.quantity += t.quantity
    clientProductSum.set(key, acc)
  }
  const productNamesForPrice = new Map((await db.products.toArray()).map((p) => [p.id!, p.canonicalName]))
  const clientNamesForPrice = new Map((await db.clients.toArray()).map((c) => [c.id!, c.canonicalName]))
  const priceOutliers: { clientId: number; productId: number; diffPercent: number }[] = []
  for (const { value, quantity, productId, clientId } of clientProductSum.values()) {
    const productTotals = productPriceSum.get(productId)
    if (!productTotals || productTotals.quantity <= quantity) continue // exclude cazul in care clientul E toata piata produsului
    const productAvgPrice = productTotals.value / productTotals.quantity
    const clientPrice = value / quantity
    if (productAvgPrice <= 0) continue
    const diffPercent = ((clientPrice - productAvgPrice) / productAvgPrice) * 100
    if (diffPercent <= -PRICE_BELOW_AVG_THRESHOLD) priceOutliers.push({ clientId, productId, diffPercent })
  }
  priceOutliers.sort((a, b) => a.diffPercent - b.diffPercent)
  for (const o of priceOutliers.slice(0, MAX_PER_CATEGORY)) {
    alerts.push({
      severity: 'amber',
      message: `Prețul mediu pentru ${productNamesForPrice.get(o.productId) ?? `#${o.productId}`} la clientul ${clientNamesForPrice.get(o.clientId) ?? `#${o.clientId}`} este cu ${Math.abs(o.diffPercent).toFixed(0)}% sub media produsului.`,
      link: { type: 'client', id: o.clientId },
    })
  }

  return alerts
}
