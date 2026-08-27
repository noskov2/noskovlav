import { db } from '../db/db'
import type { SavedReport, SavedReportConfig } from '../types'

/** Rapoarte salvate (spec §30): preseturi complete de filtre + dimensiune + indicatori + Top N. */
export async function listSavedReports(): Promise<SavedReport[]> {
  const reports = await db.savedReports.toArray()
  return reports.sort((a, b) => b.createdAt - a.createdAt)
}

export async function saveReport(name: string, config: SavedReportConfig): Promise<number> {
  const id = await db.savedReports.add({ name, createdAt: Date.now(), config })
  return id as number
}

export async function deleteSavedReport(id: number): Promise<void> {
  await db.savedReports.delete(id)
}
