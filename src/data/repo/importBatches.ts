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
