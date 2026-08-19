import Dexie, { type EntityTable } from 'dexie'
import type {
  TransactionLine,
  Product,
  Cashier,
  ImportBatch,
  SupplierReceiptLine,
  AppSettings,
} from '@/types/domain'

// Single IndexedDB database for the whole app. All persistence goes through
// the repositories in src/data/repo/* — nothing outside src/data should
// import this file directly, so swapping to a server backend later only
// means rewriting the repo layer.
class PecoDatabase extends Dexie {
  transactions!: EntityTable<TransactionLine, 'id'>
  products!: EntityTable<Product, 'id'>
  cashiers!: EntityTable<Cashier, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  supplierReceipts!: EntityTable<SupplierReceiptLine, 'id'>
  settings!: EntityTable<AppSettings, 'id'>

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
  }
}

export const db = new PecoDatabase()
