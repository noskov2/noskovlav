import { db } from '@/data/db'
import type { ImportBatch } from '@/types/domain'

export async function listImportBatches(): Promise<ImportBatch[]> {
  return (await db.importBatches.toArray()).sort((a, b) => b.importedAt - a.importedAt)
}

export async function addImportBatch(batch: ImportBatch): Promise<void> {
  await db.importBatches.put(batch)
}

export async function deleteImportBatch(id: string): Promise<void> {
  await db.importBatches.delete(id)
}

/**
 * Backfills dateMin/dateMax on purchase (Achiziții) batches imported before
 * importPurchaseSheet started computing that interval — those rows were
 * stored with both null forever, since addImportBatch only computes the
 * interval at import time and nothing ever revisits an already-stored
 * batch. Recomputes it from the receipt lines already saved for each
 * affected batch (their real `date` field). Cheap: only batches still
 * missing an interval do any work, and this is a no-op once they're fixed.
 */
export async function backfillPurchaseBatchDates(): Promise<number> {
  const batches = await db.importBatches.where('kind').equals('purchases').toArray()
  const missing = batches.filter((b) => !b.dateMin || !b.dateMax)
  if (missing.length === 0) return 0

  let updated = 0
  for (const batch of missing) {
    const rows = await db.supplierReceipts.where('importBatchId').equals(batch.id).toArray()
    let dateMin: string | null = null
    let dateMax: string | null = null
    for (const r of rows) {
      if (!dateMin || r.date < dateMin) dateMin = r.date
      if (!dateMax || r.date > dateMax) dateMax = r.date
    }
    if (dateMin && dateMax) {
      await db.importBatches.put({ ...batch, dateMin, dateMax })
      updated++
    }
  }
  return updated
}
