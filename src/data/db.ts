import Dexie, { type EntityTable } from 'dexie'
import type {
  TransactionLine,
  Product,
  Cashier,
  Team,
  ImportBatch,
  SupplierReceiptLine,
  StockSnapshotLine,
  AppSettings,
  MonthSnapshot,
  Client,
  ClientInvoiceLine,
} from '@/types/domain'

// Single IndexedDB database for the whole app. All persistence goes through
// the repositories in src/data/repo/* — nothing outside src/data should
// import this file directly, so swapping to a server backend later only
// means rewriting the repo layer.
class PecoDatabase extends Dexie {
  transactions!: EntityTable<TransactionLine, 'id'>
  products!: EntityTable<Product, 'id'>
  cashiers!: EntityTable<Cashier, 'id'>
  teams!: EntityTable<Team, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  supplierReceipts!: EntityTable<SupplierReceiptLine, 'id'>
  stockSnapshots!: EntityTable<StockSnapshotLine, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  monthSnapshots!: EntityTable<MonthSnapshot, 'id'>
  clients!: EntityTable<Client, 'id'>
  clientInvoices!: EntityTable<ClientInvoiceLine, 'id'>

  constructor() {
    super('peco-station-db')
    this.version(1).stores({
      transactions:
        'id, importBatchId, date, timestamp, cashierId, productId, receiptNo, shift',
      products: 'id, name, category, active',
      cashiers: 'id, name, active',
      importBatches: 'id, importedAt, kind',
      supplierReceipts: 'id, importBatchId, productId, supplier, date',
      settings: 'id',
    })
    this.version(2).stores({
      transactions:
        'id, importBatchId, date, timestamp, cashierId, productId, receiptNo, shift',
      products: 'id, name, category, active',
      cashiers: 'id, name, active, teamId',
      teams: 'id, name',
      importBatches: 'id, importedAt, kind',
      supplierReceipts: 'id, importBatchId, productId, supplier, date',
      stockSnapshots: 'id, importBatchId, productId, asOf',
      settings: 'id',
    })
    // v3: indexed `fingerprint` for O(log n) duplicate-import lookups instead
    // of scanning every existing transaction on every import.
    this.version(3).stores({
      transactions:
        'id, importBatchId, date, timestamp, cashierId, productId, receiptNo, shift, fingerprint',
      products: 'id, name, category, active',
      cashiers: 'id, name, active, teamId',
      teams: 'id, name',
      importBatches: 'id, importedAt, kind',
      supplierReceipts: 'id, importBatchId, productId, supplier, date',
      stockSnapshots: 'id, importBatchId, productId, asOf',
      settings: 'id',
    })
    // v4: monthSnapshots table for "Închidere lună" (immutable per-month KPI record).
    this.version(4).stores({
      transactions:
        'id, importBatchId, date, timestamp, cashierId, productId, receiptNo, shift, fingerprint',
      products: 'id, name, category, active',
      cashiers: 'id, name, active, teamId',
      teams: 'id, name',
      importBatches: 'id, importedAt, kind',
      supplierReceipts: 'id, importBatchId, productId, supplier, date',
      stockSnapshots: 'id, importBatchId, productId, asOf',
      settings: 'id',
      monthSnapshots: 'id, monthKey, closedAt',
    })
    // v5: clients + clientInvoices for issued-invoice (facturi emise) imports.
    this.version(5).stores({
      transactions:
        'id, importBatchId, date, timestamp, cashierId, productId, receiptNo, shift, fingerprint',
      products: 'id, name, category, active',
      cashiers: 'id, name, active, teamId',
      teams: 'id, name',
      importBatches: 'id, importedAt, kind',
      supplierReceipts: 'id, importBatchId, productId, supplier, date',
      stockSnapshots: 'id, importBatchId, productId, asOf',
      settings: 'id',
      monthSnapshots: 'id, monthKey, closedAt',
      clients: 'id, name, fiscalCode',
      clientInvoices: 'id, importBatchId, clientId, invoiceNo, date, onCredit',
    })
  }
}

export const db = new PecoDatabase()
