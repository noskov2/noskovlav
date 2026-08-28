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
 * `canonicalClientId`/`canonicalProductId` rămân `null` doar când identificarea
 * automată (cod/CUI/alias/nume exact) nu a găsit o potrivire sigură — rândul
 * așteaptă atunci confirmare manuală în „Potriviri clienți" (spec §7).
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
  canonicalClientId: number | null

  productRaw: string
  productNormalized: string
  productCode?: string
  categoryRaw?: string
  canonicalProductId: number | null

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

/* ------------------------------------------------------------------------ *
 * Etapa 2 — Nomenclatoare (clienți, produse) + fuzzy matching (spec §4-11)
 * ------------------------------------------------------------------------ */

/** Client canonical (§4: "Client Canonical", §10: pregătit pentru ierarhie viitoare). */
export interface ClientRecord {
  id?: number
  canonicalName: string
  canonicalNameNormalized: string
  mentorCode?: string
  cui?: string
  groupId?: number | null
  locality?: string
  county?: string
  channel?: string
  createdAt: number
  updatedAt: number
}

export type AliasSource = 'import-exact' | 'manual' | 'fuzzy-confirmed'

/* ------------------------------------------------------------------------ *
 * Etapa 6 — Rapoarte salvate (spec §30)
 * ------------------------------------------------------------------------ */

/**
 * Configurația salvată a unui raport din Generatorul de rapoarte. `filters`
 * e tipizat larg (nu `GlobalFilters` direct) ca să evite un import circular
 * cu `analytics/filters.ts` — forma e aceeași, doar structural compatibilă.
 */
export interface SavedReportConfig {
  dimension: string
  filters: Record<string, unknown>
  indicators: Record<string, boolean>
  topN: string
}

export interface SavedReport {
  id?: number
  name: string
  createdAt: number
  config: SavedReportConfig
}

/** Alias/denumire brută care indică spre un client canonical (§4, §8). */
export interface ClientAlias {
  id?: number
  clientId: number
  rawName: string
  normalizedName: string
  source: AliasSource
  confidence: number
  confirmedByUser: boolean
  createdAt: number
}

export type MatchQueueStatus = 'pending' | 'resolved' | 'ignored'

export interface MatchCandidate {
  clientId: number
  canonicalName: string
  score: number
  /**
   * Setat doar când candidatul e un client încă necreat (o altă denumire nouă
   * descoperită mai devreme în ACELAȘI import, nu unul deja din nomenclator) —
   * `clientId` e un placeholder, iar main thread-ul îl rezolvă la id-ul real
   * după ce clientul respectiv e creat (vezi worker-ul de import).
   */
  pendingNormalizedName?: string
}

/** O denumire de client neidentificată automat, în așteptarea verificării manuale (§7). */
export interface ClientMatchQueueEntry {
  normalizedName: string
  rawName: string
  clientCode?: string
  cui?: string
  candidates: MatchCandidate[]
  status: MatchQueueStatus
  occurrences: number
  firstSeenAt: number
  lastSeenAt: number
  resolvedClientId?: number
}

/** „Nu mai propune această asociere" (§7) — o pereche (nume, candidat) exclusă definitiv din sugestii. */
export interface ClientMatchBlacklistEntry {
  id?: number
  normalizedName: string
  candidateClientId: number
  createdAt: number
}

export type ClientAuditOperation = 'create' | 'alias-confirm' | 'alias-move' | 'alias-delete' | 'merge' | 'split'

/** Jurnal de audit pentru operațiile asupra nomenclatorului de clienți (§9). */
export interface ClientAuditLogEntry {
  id?: number
  date: number
  operation: ClientAuditOperation
  fromClientId?: number
  fromClientName?: string
  toClientId?: number
  toClientName?: string
  reason?: string
  actor: string
}

/**
 * Categorie sau subcategorie de produse — aceeași tabelă, cu `parentId`
 * pentru a distinge nivelul: `parentId: null` = categorie (top-level),
 * `parentId: <id categorie>` = subcategorie a acelei categorii.
 */
export interface CategoryRecord {
  id?: number
  name: string
  parentId?: number | null
  createdAt: number
}

/**
 * Produs canonical (§11: "Nomenclator Produse"). `categoryId`/`subcategoryId`
 * sunt setate DOAR din catalogul de produse importat separat (spec: "vreau
 * un loc unde import toate produsele, cu categorie și subcategorie, și
 * acestea rămân sfinte") — importul de vânzări Mentor nu le atinge niciodată,
 * indiferent ce vine în coloana "Categorie" a exportului de vânzări.
 */
export interface ProductRecord {
  id?: number
  canonicalName: string
  canonicalNameNormalized: string
  productCode?: string
  categoryId?: number | null
  subcategoryId?: number | null
  unit?: string
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface ProductAlias {
  id?: number
  productId: number
  rawName: string
  normalizedName: string
  source: 'import-exact' | 'manual'
  createdAt: number
}

/* --- Rezultatul identificării unui import (worker -> main thread) --- */

export interface NewClientRequest {
  normalizedName: string
  rawName: string
  clientCode?: string
  cui?: string
}

export interface QueueUpsertRequest {
  normalizedName: string
  rawName: string
  clientCode?: string
  cui?: string
  candidates: MatchCandidate[]
  occurrences: number
}

export interface NewProductRequest {
  normalizedName: string
  rawName: string
  productCode?: string
}
