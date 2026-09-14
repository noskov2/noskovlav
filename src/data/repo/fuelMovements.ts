import { db } from '@/data/db'
import type { FuelMovement } from '@/types/domain'

export async function bulkInsertFuelMovements(rows: FuelMovement[]): Promise<void> {
  await db.fuelMovements.bulkPut(rows)
}

export async function listAllFuelMovements(): Promise<FuelMovement[]> {
  return db.fuelMovements.toArray()
}

export async function listFuelMovementsByImportBatch(importBatchId: string): Promise<FuelMovement[]> {
  return db.fuelMovements.where('importBatchId').equals(importBatchId).toArray()
}

export async function deleteImportBatchFuelMovements(importBatchId: string): Promise<void> {
  await db.fuelMovements.where('importBatchId').equals(importBatchId).delete()
}

// Per-fingerprint COUNT already in the DB (not just presence) — same
// reasoning as transactions.ts's countAllFingerprints: two genuinely
// different movements can share a fingerprint (e.g. two identical-looking
// corrections in the same second), so only occurrences beyond what's
// already stored count as new.
export async function countAllFuelMovementFingerprints(): Promise<Map<string, number>> {
  const all = await db.fuelMovements.toArray()
  const counts = new Map<string, number>()
  for (const m of all) counts.set(m.fingerprint, (counts.get(m.fingerprint) ?? 0) + 1)
  return counts
}
