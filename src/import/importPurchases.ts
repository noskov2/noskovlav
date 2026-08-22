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
}

export async function importPurchaseSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: PurchaseColumnMapping,
): Promise<PurchaseImportResult> {
  const importBatchId = uid('import')
  const lines: SupplierReceiptLine[] = []
  let skipped = 0

  for (const row of sheet.rows) {
    const productRaw = String(row[mapping.product] ?? '').trim()
    const date = toDateString(row[mapping.date])
    const price = toNumber(row[mapping.price])
    if (!productRaw || !date || price <= 0) {
      skipped++
      continue
    }
    const supplier = String(row[mapping.supplier] ?? '').trim() || 'Necunoscut'
    const quantity = toNumber(row[mapping.quantity])

    const product = await resolveOrCreateProduct(productRaw, '', price)

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
  }

  await bulkInsertSupplierReceipts(lines)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'purchases',
    importedAt: Date.now(),
    rowCount: lines.length,
    dateMin: null,
    dateMax: null,
    fileHash: null,
    duplicateRowCount: 0,
    invalidRowCount: 0,
    newProductCount: 0,
    newCashierCount: 0,
  })

  return { importBatchId, rowCount: lines.length, skippedRows: skipped }
}
