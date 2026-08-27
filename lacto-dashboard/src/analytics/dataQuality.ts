import { db } from '../db/db'
import { confidenceScore } from '../lib/fuzzy'

export type IssueSeverity = 'high' | 'medium' | 'low'

export interface DataQualityIssue {
  severity: IssueSeverity
  category: string
  message: string
  count: number
}

export interface DataQualityResult {
  score: number
  totalTransactions: number
  issues: DataQualityIssue[]
}

const DUPLICATE_CLIENT_THRESHOLD = 70 // prag mai strict decat cel de la import (60), ca sa reduca zgomotul
const MAX_PAIRWISE_CATALOG_SIZE = 600 // peste acest numar, verificarea de duplicate pe perechi ar fi prea costisitoare

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * Calitatea datelor (spec §28): scor 0-100 + lista problemelor care necesită
 * atenție. Calculat integral din datele reale, fără valori fictive.
 */
export async function computeDataQuality(): Promise<DataQualityResult> {
  const [transactions, clients, products, batches] = await Promise.all([
    db.transactions.toArray(),
    db.clients.toArray(),
    db.products.toArray(),
    db.importBatches.toArray(),
  ])

  const total = transactions.length
  const issues: DataQualityIssue[] = []
  let penalty = 0

  function addIssue(severity: IssueSeverity, category: string, message: string, count: number, weight: number) {
    if (count === 0) return
    issues.push({ severity, category, message, count })
    penalty += weight
  }

  if (total === 0) {
    return { score: 100, totalTransactions: 0, issues: [] }
  }

  // --- probleme la nivel de rând ---
  const unidentifiedClients = transactions.filter((t) => t.canonicalClientId === null).length
  addIssue(
    unidentifiedClients / total > 0.1 ? 'high' : 'medium',
    'Clienți neidentificați',
    `${unidentifiedClients} rânduri (${((unidentifiedClients / total) * 100).toFixed(1)}%) nu au un client canonic asociat — vezi „Potriviri clienți".`,
    unidentifiedClients,
    Math.min(20, (unidentifiedClients / total) * 100),
  )

  const unidentifiedProducts = transactions.filter((t) => t.canonicalProductId === null).length
  addIssue(
    unidentifiedProducts / total > 0.1 ? 'high' : 'medium',
    'Produse neidentificate',
    `${unidentifiedProducts} rânduri (${((unidentifiedProducts / total) * 100).toFixed(1)}%) nu au un produs canonic asociat.`,
    unidentifiedProducts,
    Math.min(15, (unidentifiedProducts / total) * 100),
  )

  const zeroQuantity = transactions.filter((t) => t.quantity === 0).length
  addIssue('low', 'Cantități zero', `${zeroQuantity} rânduri au cantitatea 0.`, zeroQuantity, Math.min(5, (zeroQuantity / total) * 50))

  const zeroValue = transactions.filter((t) => t.value === 0).length
  addIssue('low', 'Valori zero', `${zeroValue} rânduri au valoarea 0.`, zeroValue, Math.min(5, (zeroValue / total) * 50))

  const negativeValues = transactions.filter((t) => (t.value ?? 0) < 0 || (t.quantity ?? 0) < 0).length
  addIssue('medium', 'Valori negative', `${negativeValues} rânduri au cantitate sau valoare negativă (posibile retururi/corecții).`, negativeValues, Math.min(10, (negativeValues / total) * 100))

  const hashCounts = new Map<string, number>()
  for (const t of transactions) hashCounts.set(t.rowHash, (hashCounts.get(t.rowHash) ?? 0) + 1)
  const duplicateRows = [...hashCounts.values()].filter((c) => c > 1).reduce((s, c) => s + c, 0)
  addIssue('medium', 'Rânduri posibil duplicate', `${duplicateRows} rânduri au aceeași semnătură (dată+client+produs+cantitate+valoare) ca alt rând.`, duplicateRows, Math.min(15, (duplicateRows / total) * 100))

  // --- probleme la nivel de nomenclator ---
  const productsWithoutCategory = products.filter((p) => p.categoryId === null || p.categoryId === undefined).length
  addIssue(
    'low',
    'Produse fără categorie',
    `${productsWithoutCategory} din ${products.length} produse nu au o categorie atribuită — vezi Nomenclator produse.`,
    productsWithoutCategory,
    products.length > 0 ? Math.min(10, (productsWithoutCategory / products.length) * 30) : 0,
  )

  if (clients.length <= MAX_PAIRWISE_CATALOG_SIZE) {
    let duplicateClientPairs = 0
    for (let i = 0; i < clients.length; i++) {
      for (let j = i + 1; j < clients.length; j++) {
        if (confidenceScore(clients[i].canonicalName, clients[j].canonicalName) >= DUPLICATE_CLIENT_THRESHOLD) duplicateClientPairs++
      }
    }
    addIssue(
      'medium',
      'Clienți posibil duplicați',
      `${duplicateClientPairs} perechi de clienți canonici au denumiri foarte asemănătoare — verifică dacă ar trebui uniți (Nomenclator clienți).`,
      duplicateClientPairs,
      Math.min(10, duplicateClientPairs * 2),
    )
  }

  if (products.length <= MAX_PAIRWISE_CATALOG_SIZE) {
    let duplicateProductPairs = 0
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        if (confidenceScore(products[i].canonicalName, products[j].canonicalName) >= DUPLICATE_CLIENT_THRESHOLD) duplicateProductPairs++
      }
    }
    addIssue(
      'low',
      'Produse posibil duplicate',
      `${duplicateProductPairs} perechi de produse canonice au denumiri foarte asemănătoare.`,
      duplicateProductPairs,
      Math.min(5, duplicateProductPairs * 1),
    )
  }

  // --- luni lipsă in intervalul acoperit ---
  const monthsPresent = new Set(transactions.map((t) => monthKey(t.year, t.month)))
  const sortedMonths = [...monthsPresent].sort()
  if (sortedMonths.length > 1) {
    const [minY, minM] = sortedMonths[0].split('-').map(Number)
    const [maxY, maxM] = sortedMonths[sortedMonths.length - 1].split('-').map(Number)
    const missingMonths: string[] = []
    let y = minY
    let m = minM
    while (y < maxY || (y === maxY && m <= maxM)) {
      const key = monthKey(y, m)
      if (!monthsPresent.has(key)) missingMonths.push(key)
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
    addIssue('medium', 'Luni lipsă', `${missingMonths.length} luni din interval nu au nicio tranzacție importată: ${missingMonths.slice(0, 6).join(', ')}${missingMonths.length > 6 ? '…' : ''}.`, missingMonths.length, Math.min(10, missingMonths.length * 2))
  }

  // --- importuri duplicate ramase in istoric (utilizatorul a ales "importa oricum") ---
  const signatureCounts = new Map<string, number>()
  for (const b of batches) if (b.status !== 'cancelled') signatureCounts.set(b.rowsSignature, (signatureCounts.get(b.rowsSignature) ?? 0) + 1)
  const duplicateBatches = [...signatureCounts.values()].filter((c) => c > 1).length
  addIssue('medium', 'Importuri cu conținut identic', `${duplicateBatches} grupuri de importuri au exact același conținut (posibil importate de mai multe ori) — vezi Istoric importuri.`, duplicateBatches, Math.min(10, duplicateBatches * 5))

  const score = Math.max(0, Math.round(100 - penalty))
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : b.severity === 'high' ? 1 : a.severity === 'medium' ? -1 : 1))

  return { score, totalTransactions: total, issues }
}
