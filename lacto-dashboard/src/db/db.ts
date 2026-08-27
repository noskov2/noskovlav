import Dexie, { type EntityTable } from 'dexie'
import type {
  CategoryRecord,
  ClientAlias,
  ClientAuditLogEntry,
  ClientMatchBlacklistEntry,
  ClientMatchQueueEntry,
  ClientRecord,
  ColumnMappingRecord,
  ImportBatch,
  ProductAlias,
  ProductRecord,
  SavedReport,
  TransactionRecord,
} from '../types'

/**
 * Baza de date locală (IndexedDB via Dexie). Datele NU sunt ținute în
 * localStorage (spec §2) — doar aici, persistent, în browser.
 *
 * Etapa 1 (fundația): transactions, importBatches, columnMappings.
 * Etapa 2 (nomenclatoare): clients, clientAliases, clientMatchQueue,
 * clientMatchBlacklist, clientAuditLog, products, productAliases, categories.
 */
export class LactoDatabase extends Dexie {
  transactions!: EntityTable<TransactionRecord, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  columnMappings!: EntityTable<ColumnMappingRecord, 'sourceFileType'>

  clients!: EntityTable<ClientRecord, 'id'>
  clientAliases!: EntityTable<ClientAlias, 'id'>
  clientMatchQueue!: EntityTable<ClientMatchQueueEntry, 'normalizedName'>
  clientMatchBlacklist!: EntityTable<ClientMatchBlacklistEntry, 'id'>
  clientAuditLog!: EntityTable<ClientAuditLogEntry, 'id'>

  products!: EntityTable<ProductRecord, 'id'>
  productAliases!: EntityTable<ProductAlias, 'id'>
  categories!: EntityTable<CategoryRecord, 'id'>

  savedReports!: EntityTable<SavedReport, 'id'>

  constructor() {
    super('LactoDashboardDB')

    // Doar indexuri folosite efectiv de interogările existente. Prea mulți
    // indecși încetinesc bulkAdd la sute de mii de rânduri — se adaugă
    // indexuri noi doar o dată cu funcționalitățile care chiar le interoghează.
    this.version(1).stores({
      transactions: '++id, date, [year+month], channel, importBatchId',
      importBatches: 'id, createdAt, sourceFileType, channel, fileSignature, status',
      columnMappings: 'sourceFileType',
    })

    // v2 (Etapa 2): nomenclatoare clienți/produse + fuzzy matching.
    // clientNormalized/productNormalized pe transactions sunt necesare pentru
    // a putea "backfill"-ui canonicalClientId/canonicalProductId pe rândurile
    // deja importate, când utilizatorul rezolvă o intrare din coada de verificare.
    this.version(2).stores({
      transactions: '++id, date, [year+month], channel, importBatchId, clientNormalized, productNormalized',
      importBatches: 'id, createdAt, sourceFileType, channel, fileSignature, status',
      columnMappings: 'sourceFileType',

      clients: '++id, mentorCode, cui, canonicalNameNormalized, groupId',
      clientAliases: '++id, clientId, normalizedName',
      clientMatchQueue: 'normalizedName, status',
      clientMatchBlacklist: '++id, normalizedName',
      clientAuditLog: '++id, date',

      products: '++id, productCode, canonicalNameNormalized, categoryId',
      productAliases: '++id, productId, normalizedName',
      categories: '++id, &name',
    })

    // v3 (Etapa 6): rapoarte salvate (preseturi de filtre din Generatorul de rapoarte).
    this.version(3).stores({
      savedReports: '++id, name, createdAt',
    })
  }
}

export const db = new LactoDatabase()
