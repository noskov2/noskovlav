import { db } from '@/data/db'
import type { StockSnapshotLine } from '@/types/domain'

export async function bulkInsertStockSnapshots(rows: StockSnapshotLine[]): Promise<void> {
  await db.stockSnapshots.bulkPut(rows)
}

export async function listAllStockSnapshots(): Promise<StockSnapshotLine[]> {
  return db.stockSnapshots.toArray()
}

export async function listStockSnapshotsByImportBatch(importBatchId: string): Promise<StockSnapshotLine[]> {
  return db.stockSnapshots.where('importBatchId').equals(importBatchId).toArray()
}

export async function deleteImportBatchStockSnapshots(importBatchId: string): Promise<void> {
  await db.stockSnapshots.where('importBatchId').equals(importBatchId).delete()
}

/**
 * Returns, for one product, the snapshot with the latest user-chosen `asOf`
 * moment — not the latest import. Two snapshots can be imported in any
 * order; the one marked as valid for the more recent date/time always wins,
 * so an old file imported late never overwrites a newer reading.
 */
export async function getLatestSnapshotForProduct(productId: string): Promise<StockSnapshotLine | undefined> {
  const rows = await db.stockSnapshots.where('productId').equals(productId).toArray()
  if (rows.length === 0) return undefined
  return rows.reduce((latest, row) => (row.asOf > latest.asOf ? row : latest))
}

export async function reassignProductInSnapshots(fromProductId: string, toProductId: string): Promise<number> {
  const rows = await db.stockSnapshots.where('productId').equals(fromProductId).toArray()
  await db.stockSnapshots.bulkPut(rows.map((r) => ({ ...r, productId: toProductId })))
  return rows.length
}
