import { uid } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toNumber } from '@/import/columnMapping'
import { getProduct, resolveOrCreateProduct, upsertProduct } from '@/data/repo/products'
import { bulkInsertStockSnapshots, getLatestSnapshotForProduct } from '@/data/repo/stockSnapshots'
import { addImportBatch } from '@/data/repo/importBatches'
import type { StockColumnMapping, StockSnapshotLine } from '@/types/domain'

export interface StockImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number
}

/**
 * Imports a "current stock" snapshot. `asOf` is chosen by the user in the
 * UI (not read from the file) so multiple snapshots taken over time never
 * get mixed up: each row is timestamped with the same asOf, and afterwards
 * every affected product's `currentStock`/`salePrice` is set from whichever
 * snapshot — this one or an earlier import — is actually the most recent
 * by asOf, regardless of import order.
 */
export async function importStockSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: StockColumnMapping,
  asOf: number,
): Promise<StockImportResult> {
  const importBatchId = uid('import')
  const lines: StockSnapshotLine[] = []
  let skipped = 0

  for (const row of sheet.rows) {
    const productRaw = String(row[mapping.product] ?? '').trim()
    if (!productRaw) {
      skipped++
      continue
    }
    const quantity = toNumber(row[mapping.quantity])
    const salePrice = mapping.salePrice ? toNumber(row[mapping.salePrice]) || null : null

    const product = await resolveOrCreateProduct(productRaw, '', null)

    lines.push({
      id: uid('stock'),
      importBatchId,
      asOf,
      productId: product.id,
      productRaw,
      quantity,
      salePrice,
    })
  }

  await bulkInsertStockSnapshots(lines)

  const asOfDate = new Date(asOf)
  const asOfIso = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}-${String(asOfDate.getDate()).padStart(2, '0')}`
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'stock',
    importedAt: Date.now(),
    rowCount: lines.length,
    dateMin: asOfIso,
    dateMax: asOfIso,
  })

  // Keep each product's "live" currentStock/salePrice pointed at whichever
  // snapshot is truly the latest by asOf, even if snapshots are imported
  // out of chronological order.
  const productIds = Array.from(new Set(lines.map((l) => l.productId)))
  for (const productId of productIds) {
    const latest = await getLatestSnapshotForProduct(productId)
    const product = await getProduct(productId)
    if (!latest || !product) continue
    await upsertProduct({
      ...product,
      currentStock: latest.quantity,
      salePrice: latest.salePrice ?? product.salePrice,
    })
  }

  return { importBatchId, rowCount: lines.length, skippedRows: skipped }
}
