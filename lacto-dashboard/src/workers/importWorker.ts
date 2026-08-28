/// <reference lib="webworker" />
import * as XLSX from 'xlsx'
import { autoDetectMapping, STANDARD_FIELDS } from '../import/fields'
import { fileSignature, rowSignature } from '../lib/hash'
import { findBestCandidates } from '../lib/fuzzy'
import type { ClientLite, ClientMatchSnapshot, ClientResolution, ProductMatchSnapshot, ProductResolution } from '../import/matching'
import { resolveClient, resolveProduct } from '../import/matching'
import { normalizeForCompare, parseRoDate, parseRoNumber } from '../lib/ro-format'
import { channelForSourceFile, normalizeChannelText } from '../types'
import type {
  Channel,
  NewClientRequest,
  NewProductRequest,
  QueueUpsertRequest,
  RejectedRow,
  SourceFileType,
  StandardFieldId,
  TransactionRecord,
} from '../types'

const CHUNK_SIZE = 10000
const HEADER_SCAN_ROWS = 5

type InMessage =
  | { type: 'detect-headers'; requestId: string; buffer: ArrayBuffer }
  | {
      type: 'process'
      requestId: string
      buffer: ArrayBuffer
      sourceFileType: SourceFileType
      sourceFile: string
      importBatchId: string
      mapping: Partial<Record<StandardFieldId, string>>
      clientSnapshot: ClientMatchSnapshot
      productSnapshot: ProductMatchSnapshot
    }
  | {
      type: 'resolve-ids'
      requestId: string
      clientIdMap: Record<string, number>
      productIdMap: Record<string, number>
    }

type OutMessage =
  | { type: 'headers'; requestId: string; headers: string[]; sample: unknown[][]; suggestion: Partial<Record<StandardFieldId, string>> }
  | {
      type: 'progress'
      requestId: string
      stage: 'citire' | 'normalizare' | 'identificare-clienti' | 'salvare'
      processed: number
      total: number
    }
  | {
      type: 'resolution-summary'
      requestId: string
      newClients: NewClientRequest[]
      queueUpserts: QueueUpsertRequest[]
      newProducts: NewProductRequest[]
    }
  | { type: 'chunk'; requestId: string; records: TransactionRecord[] }
  | {
      type: 'done'
      requestId: string
      totalRows: number
      importedRows: number
      rejectedRows: number
      errors: RejectedRow[]
      rowsSignature: string
      periodStart: string | null
      periodEnd: string | null
    }
  | { type: 'error'; requestId: string; message: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

interface RowDraft {
  base: Omit<TransactionRecord, 'canonicalClientId' | 'canonicalProductId'>
  clientRes: ClientResolution
  productRes: ProductResolution
}

interface PendingImport {
  rows: RowDraft[]
  errors: RejectedRow[]
  totalRows: number
  periodStart: string | null
  periodEnd: string | null
  rowHashes: string[]
  sourceFileType: SourceFileType
}

const pending = new Map<string, PendingImport>()

function readSheetRows(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Fisierul Excel nu contine nicio foaie de calcul.')
  const ws = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
}

/**
 * Detecteaza randul de antet: scaneaza primele randuri si alege pe cel care
 * potriveste cele mai multe campuri standard (spec S3: "detecteaza automat anteturile").
 */
function detectHeaderRowIndex(rows: unknown[][]): number {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, rows.length); i++) {
    const candidate = (rows[i] ?? []).map((c) => (c === null || c === undefined ? '' : String(c)))
    if (candidate.every((c) => c.trim() === '')) continue
    const suggestion = autoDetectMapping(candidate)
    const score = Object.keys(suggestion).length
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

function stringOrUndefined(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

/**
 * Sintetizeaza o data (prima zi a lunii) dintr-un fisier care nu are o coloana
 * de data exacta, doar An + Luna (numar) — cazul fisierelor deja agregate
 * lunar (ex. importul consolidat). Nu ghiceste: an/luna invalide -> null,
 * randul e respins ca oricare alt rand fara data.
 */
function synthesizeMonthDate(yearRaw: unknown, monthRaw: unknown): string | null {
  const year = parseRoNumber(yearRaw)
  const month = parseRoNumber(monthRaw)
  if (year === null || month === null) return null
  const y = Math.round(year)
  const m = Math.round(month)
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null
  return `${y}-${String(m).padStart(2, '0')}-01`
}

ctx.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data
  try {
    if (msg.type === 'detect-headers') {
      const rows = readSheetRows(msg.buffer)
      const headerRowIndex = detectHeaderRowIndex(rows)
      const headers = (rows[headerRowIndex] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()))
      const sample = rows.slice(headerRowIndex + 1, headerRowIndex + 6)
      const suggestion = autoDetectMapping(headers)
      const out: OutMessage = { type: 'headers', requestId: msg.requestId, headers, sample, suggestion }
      ctx.postMessage(out)
      return
    }

    if (msg.type === 'process') {
      processFile(msg)
      return
    }

    if (msg.type === 'resolve-ids') {
      finalizeImport(msg)
      return
    }
  } catch (err) {
    const out: OutMessage = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    }
    ctx.postMessage(out)
  }
}

/** Faza 1: parsare + validare + normalizare + identificare (matching pe snapshot-ul primit). */
function processFile(msg: Extract<InMessage, { type: 'process' }>) {
  const { requestId, buffer, sourceFileType, sourceFile, importBatchId, mapping, clientSnapshot, productSnapshot } = msg

  ctx.postMessage({ type: 'progress', requestId, stage: 'citire', processed: 0, total: 0 } satisfies OutMessage)
  const rows = readSheetRows(buffer)
  const headerRowIndex = detectHeaderRowIndex(rows)
  const headers = (rows[headerRowIndex] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()))
  const dataRows = rows
    .slice(headerRowIndex + 1)
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
  const total = dataRows.length

  const columnIndex: Partial<Record<StandardFieldId, number>> = {}
  for (const field of STANDARD_FIELDS) {
    const headerName = mapping[field.id]
    if (headerName) {
      const idx = headers.indexOf(headerName)
      if (idx >= 0) columnIndex[field.id] = idx
    }
  }

  // Pentru `CONSOLIDATED` canalul e per rand (coloana "Canal"); pentru celelalte
  // 4 tipuri e fix, dat de tipul fisierului.
  const fixedChannel = sourceFileType === 'CONSOLIDATED' ? null : channelForSourceFile(sourceFileType)
  const hasDateColumn = columnIndex.date !== undefined
  const hasYearMonthColumns = columnIndex.year !== undefined && columnIndex.month !== undefined
  const now = Date.now()
  const errors: RejectedRow[] = []
  const rowHashes: string[] = []
  const rowsData: RowDraft[] = []
  let periodStart: string | null = null
  let periodEnd: string | null = null

  const quantityMapped = columnIndex.quantity !== undefined
  const valueMapped = columnIndex.value !== undefined

  // Memoizare pe denumire+cod+cui: fuzzy matching-ul e scump, dar numarul de
  // denumiri DISTINCTE e mult mai mic decat numarul de randuri (ex. 40.000
  // randuri -> cateva sute de clienti distincti).
  const clientResCache = new Map<string, ClientResolution>()
  const productResCache = new Map<string, ProductResolution>()
  const queueOccurrences = new Map<string, number>()

  // Denumiri noi (fara corespondent in nomenclator) deja descoperite IN ACEST
  // import - necesar ca si ele sa participe la fuzzy matching, altfel la un
  // prim import ANABELLA/ANABELA/ANABELLA SRL etc. ar deveni fiecare un client
  // nou separat (nu se compara decat cu nomenclatorul existent, gol la start).
  const sessionNewClients: ClientLite[] = []

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const excelRowNumber = headerRowIndex + 2 + i // 1-indexed, +1 pentru antet

    const buildRawValues = (): Record<string, unknown> => {
      const rawValues: Record<string, unknown> = {}
      headers.forEach((h, idx) => {
        if (h) rawValues[h] = row[idx] ?? null
      })
      return rawValues
    }

    const get = (id: StandardFieldId): unknown => {
      const idx = columnIndex[id]
      return idx === undefined ? undefined : row[idx]
    }

    const clientRaw = get('clientRaw')
    const productRaw = get('productRaw')
    const dateIso = hasDateColumn
      ? parseRoDate(get('date'))
      : hasYearMonthColumns
        ? synthesizeMonthDate(get('year'), get('month'))
        : null

    let rowChannel: Channel | null = fixedChannel
    if (fixedChannel === null) {
      const channelText = get('channelRaw')
      rowChannel = channelText ? normalizeChannelText(String(channelText)) : null
    }

    const missing: string[] = []
    if (!clientRaw || String(clientRaw).trim() === '') missing.push('client')
    if (!productRaw || String(productRaw).trim() === '') missing.push('produs')
    if (!dateIso) missing.push(hasDateColumn ? 'data' : 'an/luna')
    if (!rowChannel) missing.push('canal')

    const quantity = quantityMapped ? parseRoNumber(get('quantity')) : null
    const value = valueMapped ? parseRoNumber(get('value')) : null
    if ((quantityMapped || valueMapped) && quantity === null && value === null) {
      missing.push('cantitate/valoare')
    }

    if (missing.length > 0) {
      errors.push({ rowNumber: excelRowNumber, reason: 'Lipsesc campuri obligatorii: ' + missing.join(', '), raw: buildRawValues() })
      continue
    }

    const clientRawStr = String(clientRaw).trim()
    const productRawStr = String(productRaw).trim()
    const [year, month] = dateIso!.split('-').map(Number)
    const documentNo = columnIndex.documentNo !== undefined ? stringOrUndefined(get('documentNo')) : undefined
    const clientCode = stringOrUndefined(get('clientCode'))
    const cui = stringOrUndefined(get('cui'))
    const productCode = stringOrUndefined(get('productCode'))

    const rowHash = rowSignature([dateIso, clientRawStr, productRawStr, quantity, value, documentNo])
    rowHashes.push(rowHash)

    const clientCacheKey = [clientRawStr, clientCode ?? '', cui ?? ''].join('')
    let clientRes = clientResCache.get(clientCacheKey)
    if (!clientRes) {
      clientRes = resolveClient(clientRawStr, clientCode, cui, clientSnapshot)

      if (clientRes.type === 'new') {
        const sessionCandidates = findBestCandidates(clientRawStr, sessionNewClients, (c) => c.canonicalName)
        if (sessionCandidates.length > 0) {
          clientRes = {
            type: 'queue',
            normalizedName: clientRes.normalizedName,
            rawName: clientRes.rawName,
            candidates: sessionCandidates.map((c) => ({
              clientId: -1,
              canonicalName: c.item.canonicalName,
              score: c.score,
              pendingNormalizedName: c.item.canonicalNameNormalized,
            })),
          }
        } else {
          sessionNewClients.push({
            id: -(sessionNewClients.length + 1),
            canonicalName: clientRes.rawName,
            canonicalNameNormalized: clientRes.normalizedName,
          })
        }
      }

      clientResCache.set(clientCacheKey, clientRes)
    }

    if (clientRes.type === 'queue') {
      queueOccurrences.set(clientRes.normalizedName, (queueOccurrences.get(clientRes.normalizedName) ?? 0) + 1)
    }

    const productCacheKey = [productRawStr, productCode ?? ''].join('')
    let productRes = productResCache.get(productCacheKey)
    if (!productRes) {
      productRes = resolveProduct(productRawStr, productCode, productSnapshot)
      productResCache.set(productCacheKey, productRes)
    }

    const base: Omit<TransactionRecord, 'canonicalClientId' | 'canonicalProductId'> = {
      date: dateIso!,
      year,
      month,
      clientRaw: clientRawStr,
      clientNormalized: normalizeForCompare(clientRawStr),
      clientCode,
      cui,
      productRaw: productRawStr,
      productNormalized: normalizeForCompare(productRawStr),
      productCode,
      categoryRaw: stringOrUndefined(get('categoryRaw')),
      subcategoryRaw: stringOrUndefined(get('subcategoryRaw')),
      channel: rowChannel!,
      sourceChannel: sourceFileType,
      quantity,
      value,
      unitPrice: parseRoNumber(get('unitPrice')),
      documentNo,
      agent: stringOrUndefined(get('agent')),
      county: stringOrUndefined(get('county')),
      locality: stringOrUndefined(get('locality')),
      importBatchId,
      sourceFile,
      rowHash,
      createdAt: now,
    }

    if (!periodStart || dateIso! < periodStart) periodStart = dateIso!
    if (!periodEnd || dateIso! > periodEnd) periodEnd = dateIso!

    rowsData.push({ base, clientRes, productRes })

    if (rowsData.length % CHUNK_SIZE === 0) {
      ctx.postMessage({ type: 'progress', requestId, stage: 'normalizare', processed: i + 1, total } satisfies OutMessage)
    }
  }

  ctx.postMessage({ type: 'progress', requestId, stage: 'normalizare', processed: total, total } satisfies OutMessage)
  ctx.postMessage({ type: 'progress', requestId, stage: 'identificare-clienti', processed: 0, total: clientResCache.size } satisfies OutMessage)

  const newClients = new Map<string, NewClientRequest>()
  const queueUpserts = new Map<string, QueueUpsertRequest>()
  for (const res of clientResCache.values()) {
    if (res.type === 'new' && !newClients.has(res.normalizedName)) {
      newClients.set(res.normalizedName, { normalizedName: res.normalizedName, rawName: res.rawName })
    } else if (res.type === 'queue' && !queueUpserts.has(res.normalizedName)) {
      queueUpserts.set(res.normalizedName, {
        normalizedName: res.normalizedName,
        rawName: res.rawName,
        candidates: res.candidates,
        occurrences: queueOccurrences.get(res.normalizedName) ?? 1,
      })
    }
  }

  const newProducts = new Map<string, NewProductRequest>()
  for (const res of productResCache.values()) {
    if (res.type === 'new' && !newProducts.has(res.normalizedName)) {
      newProducts.set(res.normalizedName, { normalizedName: res.normalizedName, rawName: res.rawName })
    }
  }

  ctx.postMessage({
    type: 'progress',
    requestId,
    stage: 'identificare-clienti',
    processed: clientResCache.size,
    total: clientResCache.size,
  } satisfies OutMessage)

  pending.set(requestId, {
    rows: rowsData,
    errors,
    totalRows: total,
    periodStart,
    periodEnd,
    rowHashes,
    sourceFileType,
  })

  ctx.postMessage({
    type: 'resolution-summary',
    requestId,
    newClients: [...newClients.values()],
    queueUpserts: [...queueUpserts.values()],
    newProducts: [...newProducts.values()],
  } satisfies OutMessage)
}

/** Faza 2: dupa ce main thread a creat clientii/produsele noi si a trimis id-urile reale, finalizeaza randurile. */
function finalizeImport(msg: Extract<InMessage, { type: 'resolve-ids' }>) {
  const { requestId, clientIdMap, productIdMap } = msg
  const state = pending.get(requestId)
  if (!state) throw new Error('Sesiunea de import a expirat sau nu a fost gasita.')
  pending.delete(requestId)

  let chunk: TransactionRecord[] = []

  for (const { base, clientRes, productRes } of state.rows) {
    const canonicalClientId =
      clientRes.type === 'matched'
        ? clientRes.clientId
        : clientRes.type === 'new'
          ? (clientIdMap[clientRes.normalizedName] ?? null)
          : null
    const canonicalProductId =
      productRes.type === 'matched' ? productRes.productId : (productIdMap[productRes.normalizedName] ?? null)

    chunk.push({ ...base, canonicalClientId, canonicalProductId })

    if (chunk.length >= CHUNK_SIZE) {
      ctx.postMessage({ type: 'chunk', requestId, records: chunk } satisfies OutMessage)
      chunk = []
    }
  }
  if (chunk.length > 0) {
    ctx.postMessage({ type: 'chunk', requestId, records: chunk } satisfies OutMessage)
  }

  const signature = fileSignature(state.sourceFileType, state.rowHashes)

  ctx.postMessage({
    type: 'done',
    requestId,
    totalRows: state.totalRows,
    importedRows: state.rows.length,
    rejectedRows: state.errors.length,
    errors: state.errors,
    rowsSignature: signature,
    periodStart: state.periodStart,
    periodEnd: state.periodEnd,
  } satisfies OutMessage)
}
