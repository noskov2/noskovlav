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
