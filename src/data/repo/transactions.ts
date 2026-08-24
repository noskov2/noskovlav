import { db } from '@/data/db'
import type { ShiftConfig, TransactionLine } from '@/types/domain'
import { determineShift } from '@/processing/shift'

export async function bulkInsertTransactions(rows: TransactionLine[]): Promise<void> {
  await db.transactions.bulkPut(rows)
}

export async function listAllTransactions(): Promise<TransactionLine[]> {
  return db.transactions.toArray()
}

export async function listTransactionsInRange(
  startDate: string,
  endDate: string,
): Promise<TransactionLine[]> {
  return db.transactions.where('date').between(startDate, endDate, true, true).toArray()
}

export async function deleteImportBatchTransactions(importBatchId: string): Promise<void> {
  await db.transactions.where('importBatchId').equals(importBatchId).delete()
}

export async function countTransactions(): Promise<number> {
  return db.transactions.count()
}

/** Every existing line's dedup fingerprint, for checking new import rows against. */
// A count per fingerprint, not just presence — two genuinely different sales
// (e.g. the same product added as two separate lines in one receipt, at the
// same price, printed in the same second) can legitimately share a
// fingerprint. A plain Set would only ever "remember" one of them existing,
// so re-importing a file that legitimately repeats that fingerprint N times
// needs to know N, not just "seen it before", to tell a real re-import
// (matching count already in the DB) apart from new, additional occurrences.
export async function countAllFingerprints(): Promise<Map<string, number>> {
  const all = await db.transactions.toArray()
  const counts = new Map<string, number>()
  for (const t of all) counts.set(t.fingerprint, (counts.get(t.fingerprint) ?? 0) + 1)
  return counts
}

export async function getDateBounds(): Promise<{ min: string | null; max: string | null }> {
  const min = await db.transactions.orderBy('date').first()
  const max = await db.transactions.orderBy('date').last()
  return { min: min?.date ?? null, max: max?.date ?? null }
}

/**
 * Re-derives the `shift` field on every stored transaction from a new
 * ShiftConfig. Needed because shift is computed once at import time and
 * persisted (for query performance), so changing the shift hours in
 * Settings would otherwise leave historical data misclassified.
 */
export async function recomputeAllShifts(shiftConfig: ShiftConfig): Promise<number> {
  const all = await db.transactions.toArray()
  const updated = all.map((t) => ({ ...t, shift: determineShift(t.time, shiftConfig) }))
  await db.transactions.bulkPut(updated)
  return updated.length
}

export async function reassignCashier(fromCashierId: string, toCashierId: string): Promise<number> {
  const rows = await db.transactions.where('cashierId').equals(fromCashierId).toArray()
  await db.transactions.bulkPut(rows.map((r) => ({ ...r, cashierId: toCashierId })))
  return rows.length
}
