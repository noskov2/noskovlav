import { db } from '@/data/db'
import type { MonthSnapshot } from '@/types/domain'

export async function listMonthSnapshots(): Promise<MonthSnapshot[]> {
  return db.monthSnapshots.toArray()
}

export async function getMonthSnapshot(monthKey: string): Promise<MonthSnapshot | undefined> {
  return db.monthSnapshots.get(monthKey)
}

export async function saveMonthSnapshot(snapshot: MonthSnapshot): Promise<void> {
  await db.monthSnapshots.put(snapshot)
}

export async function deleteMonthSnapshot(monthKey: string): Promise<void> {
  await db.monthSnapshots.delete(monthKey)
}
