import type { Cashier, ImportBatch, Product, SupplierReceiptLine, TransactionLine } from '@/types/domain'
import { buildHistoricalCostResolver } from '@/kpi/profitability'

export interface QualityFactor {
  key: string
  label: string
  // 0..100 — how healthy this factor is (100 = no problem at all)
  healthPct: number
  weight: number // how much this factor counts toward the overall score
  detail: string
  affectedCount: number
  affectedLines: TransactionLine[] // for drill-down
}

export interface DataQualityReport {
  score: number // 0..100, weighted average of factor healthPct
  factors: QualityFactor[]
}

/**
 * A single, transparent composite score covering the data-integrity
 * questions that actually change KPI numbers: can bonuri be trusted
 * (receipt-number coverage), are products categorized, is cost known
 * (so profit isn't silently partial), are cashiers/products actually
 * reviewed rather than left auto-created. Weights are a judgment call,
 * documented here rather than hidden — this is a diagnostic score, not a
 * KPI itself, so being wrong by a few points never touches the real numbers.
 */
export function computeDataQualityReport(
  transactions: TransactionLine[],
  products: Product[],
  cashiers: Cashier[],
  importBatches: ImportBatch[],
  supplierReceipts: SupplierReceiptLine[],
): DataQualityReport {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const cashiersById = new Map(cashiers.map((c) => [c.id, c]))

  const factors: QualityFactor[] = []

  // 1. Bon coverage — lines whose receipt number actually came from the file.
  const withoutReceiptNo = transactions.filter((t) => !t.hasReceiptNo)
  const bonCoveragePct = transactions.length > 0 ? ((transactions.length - withoutReceiptNo.length) / transactions.length) * 100 : 100
  factors.push({
    key: 'bonCoverage',
    label: 'Coverage bonuri (nr. bon din fișier)',
    healthPct: bonCoveragePct,
    weight: 30,
    detail: `${withoutReceiptNo.length.toLocaleString('ro-RO')} din ${transactions.length.toLocaleString('ro-RO')} linii nu au avut număr de bon în fișierul importat — au fost tratate ca bonuri de o singură linie, deci bon mediu/cross-sell pentru ele au încredere redusă.`,
    affectedCount: withoutReceiptNo.length,
    affectedLines: withoutReceiptNo,
  })

  // 2. Uncategorized products.
  const uncategorized = products.filter((p) => !p.category || p.category === 'Necategorizat')
  const uncategorizedIds = new Set(uncategorized.map((p) => p.id))
  const uncategorizedLines = transactions.filter((t) => uncategorizedIds.has(t.productId))
  const categorizedPct = products.length > 0 ? ((products.length - uncategorized.length) / products.length) * 100 : 100
  factors.push({
    key: 'categorization',
    label: 'Produse categorizate',
    healthPct: categorizedPct,
    weight: 25,
    detail: `${uncategorized.length.toLocaleString('ro-RO')} din ${products.length.toLocaleString('ro-RO')} produse nu au categorie — nu pot intra corect în niciun raport pe categorie sau grup special.`,
    affectedCount: uncategorized.length,
    affectedLines: uncategorizedLines,
  })

  // 3. Cost coverage (quantity-weighted, same resolution priority as Profitabilitate).
  const historicalCost = buildHistoricalCostResolver(supplierReceipts)
  let totalQty = 0
  let costQty = 0
  const noCostLines: TransactionLine[] = []
  for (const t of transactions) {
    totalQty += t.quantity
    const product = productsById.get(t.productId)
    const cost = t.purchasePriceUnit ?? historicalCost(t.productId, t.date) ?? product?.purchasePrice ?? null
    if (cost != null) costQty += t.quantity
    else noCostLines.push(t)
  }
  const costCoveragePct = totalQty > 0 ? (costQty / totalQty) * 100 : 100
  factors.push({
    key: 'costCoverage',
    label: 'Coverage cost achiziție',
    healthPct: costCoveragePct,
    weight: 20,
    detail: `${costCoveragePct.toFixed(1)}% din cantitatea vândută are un cost cunoscut (linie proprie, istoric furnizor sau preț din Nomenclator) — restul nu intră în calculul de profit.`,
    affectedCount: noCostLines.length,
    affectedLines: noCostLines,
  })

  // 4. Unknown cashiers ("Necunoscut" — no cashier column value on the row).
  const unknownCashierLines = transactions.filter((t) => {
    const c = cashiersById.get(t.cashierId)
    return t.cashierRaw === 'Necunoscut' || !c
  })
  const knownCashierPct = transactions.length > 0 ? ((transactions.length - unknownCashierLines.length) / transactions.length) * 100 : 100
  factors.push({
    key: 'cashiers',
    label: 'Casieri cunoscuți',
    healthPct: knownCashierPct,
    weight: 10,
    detail: `${unknownCashierLines.length.toLocaleString('ro-RO')} linii nu au casier identificat în fișier.`,
    affectedCount: unknownCashierLines.length,
    affectedLines: unknownCashierLines,
  })

  // 5. Auto-created products never reviewed in Nomenclator.
  const unreviewed = products.filter((p) => p.autoCreated)
  const unreviewedIds = new Set(unreviewed.map((p) => p.id))
  const unreviewedLines = transactions.filter((t) => unreviewedIds.has(t.productId))
  const reviewedPct = products.length > 0 ? ((products.length - unreviewed.length) / products.length) * 100 : 100
  factors.push({
    key: 'reviewed',
    label: 'Produse revizuite în Nomenclator',
    healthPct: reviewedPct,
    weight: 10,
    detail: `${unreviewed.length.toLocaleString('ro-RO')} produse au fost create automat la import și nu au fost încă revizuite (categorie/grupuri/preț confirmate manual).`,
    affectedCount: unreviewed.length,
    affectedLines: unreviewedLines,
  })

  // 6. Invalid rows excluded at import time (informational — not per-line since they were never stored).
  const totalInvalid = importBatches.reduce((s, b) => s + (b.invalidRowCount ?? 0), 0)
  const totalImportedRows = importBatches.reduce((s, b) => s + b.rowCount + (b.invalidRowCount ?? 0) + (b.duplicateRowCount ?? 0), 0)
  const validRowPct = totalImportedRows > 0 ? ((totalImportedRows - totalInvalid) / totalImportedRows) * 100 : 100
  factors.push({
    key: 'invalidRows',
    label: 'Rânduri cu valori valide la import',
    healthPct: validRowPct,
    weight: 5,
    detail: `${totalInvalid.toLocaleString('ro-RO')} rânduri au fost excluse la import din cauza unei cantități/valori nenumerice — nu au fost transformate silențios în 0.`,
    affectedCount: totalInvalid,
    affectedLines: [],
  })

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
  const score = totalWeight > 0 ? factors.reduce((s, f) => s + f.healthPct * f.weight, 0) / totalWeight : 100

  return { score, factors }
}
