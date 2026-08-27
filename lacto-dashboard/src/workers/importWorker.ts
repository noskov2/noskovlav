/// <reference lib="webworker" />
import * as XLSX from 'xlsx'
import { autoDetectMapping, STANDARD_FIELDS } from '../import/fields'
import { fileSignature, rowSignature } from '../lib/hash'
import { normalizeForCompare, parseRoDate, parseRoNumber } from '../lib/ro-format'
import { channelForSourceFile } from '../types'
import type {
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
    }

type OutMessage =
  | { type: 'headers'; requestId: string; headers: string[]; sample: unknown[][]; suggestion: Partial<Record<StandardFieldId, string>> }
  | { type: 'progress'; requestId: string; stage: 'citire' | 'normalizare' | 'identificare-clienti'; processed: number; total: number }
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

function readSheetRows(buffer: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('Fișierul Excel nu conține nicio foaie de calcul.')
  const ws = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][]
}

/** Detectează rândul de antet: scanează primele rânduri și alege pe cel care
 * potrivește cele mai multe câmpuri standard (spec §3: "detectează automat anteturile"). */
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
  } catch (err) {
    const out: OutMessage = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    }
    ctx.postMessage(out)
  }
}

function processFile(msg: Extract<InMessage, { type: 'process' }>) {
  const { requestId, buffer, sourceFileType, sourceFile, importBatchId, mapping } = msg

  ctx.postMessage({ type: 'progress', requestId, stage: 'citire', processed: 0, total: 0 } satisfies OutMessage)
  const rows = readSheetRows(buffer)
  const headerRowIndex = detectHeaderRowIndex(rows)
  const headers = (rows[headerRowIndex] ?? []).map((c) => (c === null || c === undefined ? '' : String(c).trim()))
  const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
  const total = dataRows.length

  const columnIndex: Partial<Record<StandardFieldId, number>> = {}
  for (const field of STANDARD_FIELDS) {
    const headerName = mapping[field.id]
    if (headerName) {
      const idx = headers.indexOf(headerName)
      if (idx >= 0) columnIndex[field.id] = idx
    }
  }

  const channel = channelForSourceFile(sourceFileType)
  const now = Date.now()
  const errors: RejectedRow[] = []
  const rowHashes: string[] = []
  let importedRows = 0
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let chunk: TransactionRecord[] = []

  const quantityMapped = columnIndex.quantity !== undefined
  const valueMapped = columnIndex.value !== undefined

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
    const dateIso = parseRoDate(get('date'))

    const missing: string[] = []
    if (!clientRaw || String(clientRaw).trim() === '') missing.push('client')
    if (!productRaw || String(productRaw).trim() === '') missing.push('produs')
    if (!dateIso) missing.push('data')

    const quantity = quantityMapped ? parseRoNumber(get('quantity')) : null
    const value = valueMapped ? parseRoNumber(get('value')) : null
    if ((quantityMapped || valueMapped) && quantity === null && value === null) {
      missing.push('cantitate/valoare')
    }

    if (missing.length > 0) {
      errors.push({ rowNumber: excelRowNumber, reason: `Lipsesc câmpuri obligatorii: ${missing.join(', ')}`, raw: buildRawValues() })
      continue
    }

    const clientRawStr = String(clientRaw).trim()
    const productRawStr = String(productRaw).trim()
    const [year, month] = dateIso!.split('-').map(Number)
    const documentNo = columnIndex.documentNo !== undefined ? stringOrUndefined(get('documentNo')) : undefined

    const rowHash = rowSignature([dateIso, clientRawStr, productRawStr, quantity, value, documentNo])
    rowHashes.push(rowHash)

    const record: TransactionRecord = {
      date: dateIso!,
      year,
      month,
      clientRaw: clientRawStr,
      clientNormalized: normalizeForCompare(clientRawStr),
      clientCode: stringOrUndefined(get('clientCode')),
      cui: stringOrUndefined(get('cui')),
      canonicalClientId: null,
      productRaw: productRawStr,
      productNormalized: normalizeForCompare(productRawStr),
      productCode: stringOrUndefined(get('productCode')),
      categoryRaw: stringOrUndefined(get('categoryRaw')),
      canonicalProductId: null,
      channel,
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

    chunk.push(record)
    importedRows++

    if (chunk.length >= CHUNK_SIZE) {
      ctx.postMessage({ type: 'chunk', requestId, records: chunk } satisfies OutMessage)
      chunk = []
      ctx.postMessage({ type: 'progress', requestId, stage: 'normalizare', processed: i + 1, total } satisfies OutMessage)
    }
  }

  if (chunk.length > 0) {
    ctx.postMessage({ type: 'chunk', requestId, records: chunk } satisfies OutMessage)
  }
  ctx.postMessage({ type: 'progress', requestId, stage: 'normalizare', processed: total, total } satisfies OutMessage)
  ctx.postMessage({ type: 'progress', requestId, stage: 'identificare-clienti', processed: total, total } satisfies OutMessage)

  const signature = fileSignature(sourceFileType, rowHashes)

  ctx.postMessage({
    type: 'done',
    requestId,
    totalRows: total,
    importedRows,
    rejectedRows: errors.length,
    errors,
    rowsSignature: signature,
    periodStart,
    periodEnd,
  } satisfies OutMessage)
}

function stringOrUndefined(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}
