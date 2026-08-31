import { uid, slugify } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toDateString, toNumber, toTimeString } from '@/import/columnMapping'
import { isInvalidDateToken, isInvalidNumericToken, computeLineFingerprint } from '@/import/validate'
import { listCashiers, bulkSetCashiers, buildNewCashier } from '@/data/repo/cashiers'
import { listProducts, bulkSetProducts, buildNewProduct } from '@/data/repo/products'
import { bulkInsertTransactions, countAllFingerprints } from '@/data/repo/transactions'
import { addImportBatch } from '@/data/repo/importBatches'
import { getSettings } from '@/data/repo/settings'
import { determineShift } from '@/processing/shift'
import type { Cashier, Product, SalesColumnMapping, ShiftConfig, TransactionLine } from '@/types/domain'

export interface ImportProgress {
  processed: number
  total: number
}

export interface ImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number // missing product/date — can't be a transaction at all
  duplicateRowCount: number // identical fingerprint already in the database
  invalidRowCount: number // unparseable quantity/value — excluded rather than silently zeroed
  newProductCount: number
  newCashierCount: number
  dateMin: string | null
  dateMax: string | null
}

export async function importSalesSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: SalesColumnMapping,
  shiftConfig: ShiftConfig,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const importBatchId = uid('import')
  const lines: TransactionLine[] = []
  let skipped = 0
  let duplicateRowCount = 0
  let invalidRowCount = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  // Per-fingerprint COUNT already in the DB, not just presence — two
  // genuinely different sales can share a fingerprint (e.g. the same
  // product added as two separate lines in one receipt, same price, same
  // second). A row is only a duplicate once this import has already seen
  // at least as many occurrences of its fingerprint as already exist in the
  // DB; anything beyond that count is a new, additional real sale, not a
  // re-import of the same line. This was a real bug: re-exporting the same
  // period could legitimately repeat a fingerprint several times a day
  // (identical items scanned as separate lines), and the old presence-only
  // check silently dropped every occurrence past the first, undercounting
  // real daily revenue by hundreds of lei.
  const existingFingerprintCounts = await countAllFingerprints()
  const seenInThisImport = new Map<string, number>()

  // Product/cashier resolution used to be one IndexedDB scan PER ROW
  // (resolveOrCreateProduct/resolveOrCreateCashier each ran a full-table
  // `.filter().first()`), which is fine for a handful of rows but turns a
  // real multi-thousand-row file into minutes of silent, unresponsive work.
  // Everything is loaded into memory once instead, resolved/created
  // in-memory for the whole file, and only the products/cashiers that are
  // actually new or gained an alias get written back — in one bulk write
  // at the end, not one `put` per row.
  const allProducts = await listProducts()
  const allCashiers = await listCashiers()
  const settings = await getSettings()
  const productsBefore = new Set(allProducts.map((p) => p.id))
  const cashiersBefore = new Set(allCashiers.map((c) => c.id))

  const productByAlias = new Map<string, Product>()
  const productById = new Map<string, Product>()
  for (const p of allProducts) {
    productById.set(p.id, p)
    for (const alias of p.aliases) productByAlias.set(alias, p)
  }
  const cashierByAlias = new Map<string, Cashier>()
  const cashierById = new Map<string, Cashier>()
  for (const c of allCashiers) {
    cashierById.set(c.id, c)
    for (const alias of c.aliases) cashierByAlias.set(alias, c)
  }
  const dirtyProducts = new Map<string, Product>()
  const dirtyCashiers = new Map<string, Cashier>()

  function resolveProduct(rawName: string, categoryRaw: string, purchasePriceUnit: number | null): Product {
    const trimmed = rawName.trim()
    const existingByAlias = productByAlias.get(trimmed)
    if (existingByAlias) return existingByAlias

    const id = slugify(trimmed) || `product-${Date.now()}`
    const existingById = productById.get(id)
    if (existingById) {
      if (!existingById.aliases.includes(trimmed)) {
        const updated: Product = {
          ...existingById,
          aliases: [...existingById.aliases, trimmed],
          purchasePrice: existingById.purchasePrice ?? purchasePriceUnit,
        }
        productById.set(id, updated)
        productByAlias.set(trimmed, updated)
        dirtyProducts.set(id, updated)
        return updated
      }
      return existingById
    }

    const product = buildNewProduct(rawName, categoryRaw, purchasePriceUnit, settings)
    productById.set(product.id, product)
    productByAlias.set(trimmed, product)
    dirtyProducts.set(product.id, product)
    return product
  }

  function resolveCashier(rawName: string): Cashier {
    const trimmed = rawName.trim() || 'Necunoscut'
    const existingByAlias = cashierByAlias.get(trimmed)
    if (existingByAlias) return existingByAlias

    const id = slugify(trimmed) || `cashier-${Date.now()}`
    const existingById = cashierById.get(id)
    if (existingById) {
      if (!existingById.aliases.includes(trimmed)) {
        const updated: Cashier = { ...existingById, aliases: [...existingById.aliases, trimmed] }
        cashierById.set(id, updated)
        cashierByAlias.set(trimmed, updated)
        dirtyCashiers.set(id, updated)
        return updated
      }
      return existingById
    }

    const cashier = buildNewCashier(rawName)
    cashierById.set(cashier.id, cashier)
    cashierByAlias.set(trimmed, cashier)
    dirtyCashiers.set(cashier.id, cashier)
    return cashier
  }

  const total = sheet.rows.length
  for (let i = 0; i < total; i++) {
    const row = sheet.rows[i]

    const productRaw = String(row[mapping.product] ?? '').trim()
    if (!productRaw) {
      skipped++
      continue
    }

    const rawDateValue = mapping.datetime ? row[mapping.datetime] : mapping.date ? row[mapping.date] : null
    if (mapping.datetime || mapping.date) {
      if (isInvalidDateToken(rawDateValue)) {
        skipped++
        continue
      }
    }

    let date = ''
    let time = ''
    if (mapping.datetime) {
      const raw = row[mapping.datetime]
      date = toDateString(raw)
      time = toTimeString(raw)
    } else {
      date = mapping.date ? toDateString(row[mapping.date]) : ''
      time = mapping.time ? toTimeString(row[mapping.time]) : '00:00:00'
    }
    if (!date) {
      skipped++
      continue
    }

    const rawQuantity = row[mapping.quantity]
    const rawValue = row[mapping.value]
    if (isInvalidNumericToken(rawQuantity) || isInvalidNumericToken(rawValue)) {
      invalidRowCount++
      continue
    }

    const cashierRaw = String(row[mapping.cashier] ?? '').trim() || 'Necunoscut'
    const categoryRaw = mapping.category ? String(row[mapping.category] ?? '').trim() : ''
    const quantity = toNumber(rawQuantity)
    const value = toNumber(rawValue)
    const purchasePriceUnit = mapping.purchasePrice ? toNumber(row[mapping.purchasePrice]) || null : null
    const valueNoVat = mapping.valueNoVat ? toNumber(row[mapping.valueNoVat]) || null : null
    const promotionRaw = mapping.promotion ? String(row[mapping.promotion] ?? '').trim() || null : null
    const rawReceiptNo = String(row[mapping.receiptNo] ?? '').trim()
    const hasReceiptNo = !!rawReceiptNo
    // A synthetic-but-unique key when the export has no bon number, so
    // lines never get silently merged into someone else's receipt — but
    // never claim it groups multiple lines into one real bon; hasReceiptNo
    // is what "coverage bonuri" is computed from, not this key's shape.
    const receiptNo = hasReceiptNo ? rawReceiptNo : `no-bon-${date}-${i}`

    const fingerprint = computeLineFingerprint(date, time, cashierRaw, rawReceiptNo, productRaw, quantity, value)
    const alreadyInDb = existingFingerprintCounts.get(fingerprint) ?? 0
    const seenSoFar = seenInThisImport.get(fingerprint) ?? 0
    seenInThisImport.set(fingerprint, seenSoFar + 1)
    if (seenSoFar < alreadyInDb) {
      duplicateRowCount++
      continue
    }

    const cashier = resolveCashier(cashierRaw)
    const product = resolveProduct(productRaw, categoryRaw, purchasePriceUnit)

    const timestamp = new Date(`${date}T${time}`).getTime()
    const shift = determineShift(time, shiftConfig)

    lines.push({
      id: uid('tx'),
      importBatchId,
      date,
      time,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      cashierRaw,
      cashierId: cashier.id,
      receiptNo,
      productRaw,
      productId: product.id,
      categoryRaw,
      quantity,
      value,
      valueNoVat,
      purchasePriceUnit,
      shift,
      promotionRaw,
      hasReceiptNo,
      fingerprint,
      rowIndex: i,
    })

    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date

    if (onProgress && i % 200 === 0) onProgress({ processed: i, total })
  }

  const newProductIds = new Set(lines.map((l) => l.productId).filter((id) => !productsBefore.has(id)))
  const newCashierIds = new Set(lines.map((l) => l.cashierId).filter((id) => !cashiersBefore.has(id)))

  if (dirtyProducts.size > 0) await bulkSetProducts(Array.from(dirtyProducts.values()))
  if (dirtyCashiers.size > 0) await bulkSetCashiers(Array.from(dirtyCashiers.values()))
  await bulkInsertTransactions(lines)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'sales',
    importedAt: Date.now(),
    rowCount: lines.length,
    dateMin,
    dateMax,
    fileHash: null,
    duplicateRowCount,
    invalidRowCount,
    newProductCount: newProductIds.size,
    newCashierCount: newCashierIds.size,
    newClientCount: 0,
  })

  onProgress?.({ processed: total, total })

  return {
    importBatchId,
    rowCount: lines.length,
    skippedRows: skipped,
    duplicateRowCount,
    invalidRowCount,
    newProductCount: newProductIds.size,
    newCashierCount: newCashierIds.size,
    dateMin,
    dateMax,
  }
}
