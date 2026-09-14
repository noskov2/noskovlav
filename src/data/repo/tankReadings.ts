import { db } from '@/data/db'
import type { TankReading } from '@/types/domain'

export async function bulkInsertTankReadings(rows: TankReading[]): Promise<void> {
  await db.tankReadings.bulkPut(rows)
}

export async function listAllTankReadings(): Promise<TankReading[]> {
  return db.tankReadings.toArray()
}

export async function listTankReadingsByImportBatch(importBatchId: string): Promise<TankReading[]> {
  return db.tankReadings.where('importBatchId').equals(importBatchId).toArray()
}

export async function deleteImportBatchTankReadings(importBatchId: string): Promise<void> {
  await db.tankReadings.where('importBatchId').equals(importBatchId).delete()
}
