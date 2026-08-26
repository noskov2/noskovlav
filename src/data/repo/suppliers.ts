import { db } from '@/data/db'
import type { SupplierReceiptLine } from '@/types/domain'

export async function bulkInsertSupplierReceipts(rows: SupplierReceiptLine[]): Promise<void> {
  await db.supplierReceipts.bulkPut(rows)
}

export async function listAllSupplierReceipts(): Promise<SupplierReceiptLine[]> {
  return db.supplierReceipts.toArray()
}

export async function deleteImportBatchSupplierReceipts(importBatchId: string): Promise<void> {
  await db.supplierReceipts.where('importBatchId').equals(importBatchId).delete()
}

export async function reassignProductInReceipts(fromProductId: string, toProductId: string): Promise<number> {
  const rows = await db.supplierReceipts.where('productId').equals(fromProductId).toArray()
  await db.supplierReceipts.bulkPut(rows.map((r) => ({ ...r, productId: toProductId })))
  return rows.length
}
