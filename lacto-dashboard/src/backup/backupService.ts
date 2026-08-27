import { db } from '../db/db'

const APP_NAME = 'lacto-dashboard'

export interface BackupPayload {
  appName: typeof APP_NAME
  schemaVersion: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export interface TableSummary {
  tableName: string
  rowCount: number
}

/** Backup complet (spec §32): toate tabelele Dexie, într-un singur fișier JSON descărcat local. */
export async function exportBackup(): Promise<TableSummary[]> {
  const tables: Record<string, unknown[]> = {}
  const summary: TableSummary[] = []
  for (const table of db.tables) {
    const rows = await table.toArray()
    tables[table.name] = rows
    summary.push({ tableName: table.name, rowCount: rows.length })
  }

  const payload: BackupPayload = {
    appName: APP_NAME,
    schemaVersion: db.verno,
    exportedAt: Date.now(),
    tables,
  }

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lacto-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return summary
}

/**
 * Restaurare completă (spec §32): golește TOATE tabelele și le repopulează
 * exact din fișierul de backup, păstrând id-urile originale (relațiile dintre
 * tabele — ex. clientAliases.clientId — rămân valide). Operațiune distructivă,
 * confirmată de UI înainte de apel.
 */
export async function restoreBackup(file: File): Promise<TableSummary[]> {
  const text = await file.text()
  let payload: BackupPayload
  try {
    payload = JSON.parse(text) as BackupPayload
  } catch {
    throw new Error('Fișierul nu este un JSON valid.')
  }
  if (payload.appName !== APP_NAME || typeof payload.tables !== 'object' || payload.tables === null) {
    throw new Error('Fișierul nu pare a fi un backup valid Lacto Dashboard.')
  }

  const summary: TableSummary[] = []
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = payload.tables[table.name] ?? []
      await table.clear()
      if (rows.length > 0) await table.bulkAdd(rows)
      summary.push({ tableName: table.name, rowCount: rows.length })
    }
  })
  return summary
}
