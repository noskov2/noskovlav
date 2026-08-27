import Dexie, { type EntityTable } from 'dexie'
import type { ColumnMappingRecord, ImportBatch, TransactionRecord } from '../types'

/**
 * Baza de date locală (IndexedDB via Dexie). Datele NU sunt ținute în
 * localStorage (spec §2) — doar aici, persistent, în browser.
 *
 * Etapa 1 (fundația): transactions, importBatches, columnMappings.
 * Tabelele de nomenclatoare (clienți/produse/aliasuri) se adaugă în Etapa 2.
 */
export class LactoDatabase extends Dexie {
  transactions!: EntityTable<TransactionRecord, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  columnMappings!: EntityTable<ColumnMappingRecord, 'sourceFileType'>

  constructor() {
    super('LactoDashboardDB')

    // Doar indexuri folosite efectiv de interogările din Etapa 1 (importBatchId
    // pentru ștergerea unui batch) plus câmpurile de bază pentru filtrare pe
    // perioadă/canal, necesare curând în Etapa 3. Prea mulți indecși încetinesc
    // considerabil bulkAdd la sute de mii de rânduri — se adaugă indexuri noi
    // (clientNormalized, productNormalized etc.) într-o versiune viitoare, o
    // dată cu funcționalitățile care chiar le interoghează (Etapa 2/3).
    this.version(1).stores({
      transactions: '++id, date, [year+month], channel, importBatchId',
      importBatches: 'id, createdAt, sourceFileType, channel, fileSignature, status',
      columnMappings: 'sourceFileType',
    })
  }
}

export const db = new LactoDatabase()
