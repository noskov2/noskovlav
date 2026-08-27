import { uid } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toDateString, toNumber } from '@/import/columnMapping'
import { resolveOrCreateProduct } from '@/data/repo/products'
import { bulkInsertSupplierReceipts } from '@/data/repo/suppliers'
import { addImportBatch } from '@/data/repo/importBatches'
import type { PurchaseColumnMapping, SupplierReceiptLine } from '@/types/domain'

export interface PurchaseImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number
  dateMin: string | null
  dateMax: string | null
}

export async function importPurchaseSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: PurchaseColumnMapping,
): Promise<PurchaseImportResult> {
  const importBatchId = uid('import')
  const lines: SupplierReceiptLine[] = []
  let skipped = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  for (const row of sheet.rows) {
    const productRaw = String(row[mapping.product] ?? '').trim()
    const date = toDateString(row[mapping.date])
    const price = toNumber(row[mapping.price])
    if (!productRaw || !date || price <= 0) {
      skipped++
      continue
    }
    const supplierRaw = String(row[mapping.supplier] ?? '').trim()
    const supplier = supplierRaw || 'Necunoscut'
    const quantity = toNumber(row[mapping.quantity])

    // Only a real supplier name from the file should ever land on the
    // product's own "Furnizor" field in Nomenclator — the "Necunoscut"
    // placeholder is fine on the receipt line itself, but it must never
    // fill in the product record as if it were a real answer.
    const product = await resolveOrCreateProduct(productRaw, '', price, supplierRaw)

    lines.push({
      id: uid('sup'),
      importBatchId,
      productId: product.id,
      productRaw,
      supplier,
      date,
      quantity,
      price,
    })
    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date
  }

  await bulkInsertSupplierReceipts(lines)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'purchases',
    importedAt: Date.now(),
    rowCount: lines.length,
    dateMin,
    dateMax,
    fileHash: null,
    duplicateRowCount: 0,
    invalidRowCount: 0,
    newProductCount: 0,
    newCashierCount: 0,
    newClientCount: 0,
  })

  return { importBatchId, rowCount: lines.length, skippedRows: skipped, dateMin, dateMax }
}
