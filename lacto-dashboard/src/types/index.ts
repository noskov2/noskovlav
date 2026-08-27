/**
 * Cele 4 tipuri de fișiere sursă exportate lunar din Mentor (spec §2).
 */
export type SourceFileType =
  | 'RETELE_MARI'
  | 'MAGAZINE_PROPRII'
  | 'DISTRIBUTIE'
  | 'DISTRIBUTIE_2'

/** Canalul standardizat (spec §3): DISTRIBUȚIE și DISTRIBUȚIE 2 se unifică. */
export type Channel = 'RETELE' | 'MAGAZINE PROPRII' | 'DISTRIBUTIE'

export const SOURCE_FILE_TYPES: {
  id: SourceFileType
  label: string
  channel: Channel
}[] = [
  { id: 'RETELE_MARI', label: 'REȚELE MARI', channel: 'RETELE' },
  { id: 'MAGAZINE_PROPRII', label: 'MAGAZINE PROPRII', channel: 'MAGAZINE PROPRII' },
  { id: 'DISTRIBUTIE', label: 'DISTRIBUȚIE', channel: 'DISTRIBUTIE' },
  { id: 'DISTRIBUTIE_2', label: 'DISTRIBUȚIE 2', channel: 'DISTRIBUTIE' },
]

export function sourceFileLabel(type: SourceFileType): string {
  return SOURCE_FILE_TYPES.find((s) => s.id === type)?.label ?? type
}

export function channelForSourceFile(type: SourceFileType): Channel {
  return SOURCE_FILE_TYPES.find((s) => s.id === type)?.channel ?? 'DISTRIBUTIE'
}

/**
 * Un rând de tranzacție (vânzare), așa cum e stocat în IndexedDB.
 * Câmpurile de identificare canonică a clientului/produsului sunt `null`
 * până la Etapa 2 (nomenclatoare + fuzzy matching), care nu e construită încă.
 */
export interface TransactionRecord {
  id?: number
  date: string // ISO yyyy-mm-dd
  year: number
  month: number // 1-12

  clientRaw: string
  clientNormalized: string
  clientCode?: string
  cui?: string
  canonicalClientId: string | null

  productRaw: string
  productNormalized: string
  productCode?: string
  categoryRaw?: string
  canonicalProductId: string | null

  channel: Channel
  sourceChannel: SourceFileType

  quantity: number | null
  value: number | null
  unitPrice: number | null

  documentNo?: string
  agent?: string
  county?: string
  locality?: string

  importBatchId: string
  sourceFile: string
  rowHash: string
  createdAt: number
}

export type ImportBatchStatus = 'processing' | 'success' | 'partial' | 'failed' | 'cancelled'

export interface RejectedRow {
  rowNumber: number
  reason: string
  raw: Record<string, unknown>
}

export interface ImportBatch {
  id: string
  createdAt: number
  fileName: string
  sourceFileType: SourceFileType
  channel: Channel
  fileSignature: string
  rowsSignature: string
  totalRows: number
  importedRows: number
  rejectedRows: number
  status: ImportBatchStatus
  periodStart?: string
  periodEnd?: string
  replacedBatchId?: string
  columnMapping: Record<string, string>
  errors: RejectedRow[]
}

/** Definiția unui câmp standard în care se pot mapa coloanele din Excel. */
export interface StandardFieldDef {
  id: StandardFieldId
  label: string
  required: boolean
  type: 'string' | 'number' | 'date'
  aliases: string[]
}

export type StandardFieldId =
  | 'clientRaw'
  | 'clientCode'
  | 'cui'
  | 'productRaw'
  | 'productCode'
  | 'categoryRaw'
  | 'quantity'
  | 'value'
  | 'unitPrice'
  | 'date'
  | 'documentNo'
  | 'agent'
  | 'county'
  | 'locality'

export interface ColumnMappingRecord {
  sourceFileType: SourceFileType
  mapping: Partial<Record<StandardFieldId, string>>
  headerSignature: string
  updatedAt: number
}

export type ImportStage =
  | 'citire'
  | 'validare'
  | 'normalizare'
  | 'identificare-clienti'
  | 'salvare'
  | 'recalculare-agregari'
  | 'finalizat'
  | 'eroare'

export interface ImportProgressEvent {
  stage: ImportStage
  processed: number
  total: number
  message?: string
}
