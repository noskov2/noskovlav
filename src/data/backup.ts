import { db } from '@/data/db'
import type {
  AppSettings,
  Cashier,
  ImportBatch,
  Product,
  StockSnapshotLine,
  SupplierReceiptLine,
  Team,
  TransactionLine,
} from '@/types/domain'

// A full local backup of the browser's IndexedDB — the only real safety net
// for an app that deliberately has no server. Exported as one JSON file the
// user keeps wherever they like; restoring replaces every table's contents
// (after a structural check) so the app always ends up in a consistent
// state, never a partial mix of old and restored data.

export const BACKUP_FORMAT_VERSION = 1

export interface BackupData {
  formatVersion: number
  exportedAt: number
  transactions: TransactionLine[]
  products: Product[]
  cashiers: Cashier[]
  teams: Team[]
  importBatches: ImportBatch[]
  supplierReceipts: SupplierReceiptLine[]
  stockSnapshots: StockSnapshotLine[]
  settings: AppSettings | null
}

export async function buildBackup(): Promise<BackupData> {
  const [transactions, products, cashiers, teams, importBatches, supplierReceipts, stockSnapshots, settingsRows] =
    await Promise.all([
      db.transactions.toArray(),
      db.products.toArray(),
      db.cashiers.toArray(),
      db.teams.toArray(),
      db.importBatches.toArray(),
      db.supplierReceipts.toArray(),
      db.stockSnapshots.toArray(),
      db.settings.toArray(),
    ])
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    transactions,
    products,
    cashiers,
    teams,
    importBatches,
    supplierReceipts,
    stockSnapshots,
    settings: settingsRows[0] ?? null,
  }
}

export async function downloadBackup(): Promise<void> {
  const data = await buildBackup()
  const json = JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date(data.exportedAt)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `peco-dashboard-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface BackupValidation {
  valid: boolean
  errors: string[]
  summary: {
    transactions: number
    products: number
    cashiers: number
    teams: number
    importBatches: number
    supplierReceipts: number
    stockSnapshots: number
    exportedAt: number | null
  } | null
}

const REQUIRED_ARRAY_KEYS: (keyof BackupData)[] = [
  'transactions',
  'products',
  'cashiers',
  'teams',
  'importBatches',
  'supplierReceipts',
  'stockSnapshots',
]

export function validateBackup(raw: unknown): BackupValidation {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, errors: ['Fișierul nu conține un obiect JSON valid.'], summary: null }
  }
  const data = raw as Record<string, unknown>
  if (typeof data.formatVersion !== 'number') errors.push('Lipsește sau este invalid „formatVersion".')
  for (const key of REQUIRED_ARRAY_KEYS) {
    if (!Array.isArray(data[key])) errors.push(`Lipsește sau nu este listă: „${key}".`)
  }
  if (errors.length > 0) return { valid: false, errors, summary: null }

  const d = data as unknown as BackupData
  return {
    valid: true,
    errors: [],
    summary: {
      transactions: d.transactions.length,
      products: d.products.length,
      cashiers: d.cashiers.length,
      teams: d.teams.length,
      importBatches: d.importBatches.length,
      supplierReceipts: d.supplierReceipts.length,
      stockSnapshots: d.stockSnapshots.length,
      exportedAt: typeof d.exportedAt === 'number' ? d.exportedAt : null,
    },
  }
}

/** Replaces every table's contents with the backup's — the only mode that
 * guarantees a consistent end state (no leftover data mixed with restored
 * data). Runs as one Dexie transaction: either it all lands, or none of it
 * does. */
export async function restoreBackup(data: BackupData): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.products, db.cashiers, db.teams, db.importBatches, db.supplierReceipts, db.stockSnapshots, db.settings],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.products.clear(),
        db.cashiers.clear(),
        db.teams.clear(),
        db.importBatches.clear(),
        db.supplierReceipts.clear(),
        db.stockSnapshots.clear(),
        db.settings.clear(),
      ])
      await Promise.all([
        db.transactions.bulkPut(data.transactions),
        db.products.bulkPut(data.products),
        db.cashiers.bulkPut(data.cashiers),
        db.teams.bulkPut(data.teams),
        db.importBatches.bulkPut(data.importBatches),
        db.supplierReceipts.bulkPut(data.supplierReceipts),
        db.stockSnapshots.bulkPut(data.stockSnapshots),
        data.settings ? db.settings.put(data.settings) : Promise.resolve(),
      ])
    },
  )
}
