import { db } from '../db/db'
import ImportWorkerCtor from '../workers/importWorker.ts?worker&inline'
import { headerSignature } from './fields'
import { hashArrayBuffer } from '../lib/hash'
import { applyImportResolutions as applyClientResolutions, loadClientSnapshot } from '../nomenclature/clientService'
import { applyImportResolutions as applyProductResolutions, loadProductSnapshot } from '../nomenclature/productService'
import type {
  ColumnMappingRecord,
  ImportBatch,
  ImportProgressEvent,
  RejectedRow,
  SourceFileType,
  StandardFieldId,
  TransactionRecord,
} from '../types'
import { channelForSourceFile } from '../types'

const SAVE_CHUNK_SIZE = 10000

function createWorker(): Worker {
  // Worker inlinat (nu fetch-uit ca fișier separat) — necesar ca aplicația să
  // funcționeze și dintr-un build standalone, deschis direct din file://.
  return new ImportWorkerCtor()
}

function newRequestId(): string {
  return crypto.randomUUID()
}

export interface HeaderDetectionResult {
  headers: string[]
  sample: unknown[][]
  suggestion: Partial<Record<StandardFieldId, string>>
}

/** Citește antetele unui fișier fără a-l procesa integral (pentru wizard-ul de mapare). */
export function detectHeaders(file: File): Promise<HeaderDetectionResult> {
  return new Promise((resolve, reject) => {
    const worker = createWorker()
    const requestId = newRequestId()

    worker.onmessage = (event: MessageEvent<any>) => {
      const msg = event.data
      if (msg.requestId !== requestId) return
      if (msg.type === 'headers') {
        resolve({ headers: msg.headers, sample: msg.sample, suggestion: msg.suggestion })
        worker.terminate()
      } else if (msg.type === 'error') {
        reject(new Error(msg.message))
        worker.terminate()
      }
    }
    worker.onerror = (e) => {
      reject(new Error(e.message))
      worker.terminate()
    }

    file.arrayBuffer().then((buffer) => {
      worker.postMessage({ type: 'detect-headers', requestId, buffer }, [buffer])
    })
  })
}

/** Caută în nomenclator o mapare deja salvată pentru acest tip de fișier, dacă anteturile coincid. */
export async function findRememberedMapping(
  sourceFileType: SourceFileType,
  headers: string[],
): Promise<ColumnMappingRecord | undefined> {
  const existing = await db.columnMappings.get(sourceFileType)
  if (!existing) return undefined
  return existing.headerSignature === headerSignature(headers) ? existing : undefined
}

export async function saveMapping(
  sourceFileType: SourceFileType,
  headers: string[],
  mapping: Partial<Record<StandardFieldId, string>>,
): Promise<void> {
  await db.columnMappings.put({
    sourceFileType,
    mapping,
    headerSignature: headerSignature(headers),
    updatedAt: Date.now(),
  })
}

export interface DuplicateCheckResult {
  duplicate: ImportBatch | null
  fileSignature: string
  buffer: ArrayBuffer
}

/** Verifică dacă acest exact fișier (bytes identici) a mai fost importat pentru acest canal (spec §12). */
export async function checkDuplicateFile(
  file: File,
  sourceFileType: SourceFileType,
): Promise<DuplicateCheckResult> {
  const buffer = await file.arrayBuffer()
  const signature = hashArrayBuffer(buffer)
  const candidates = await db.importBatches
    .where('sourceFileType')
    .equals(sourceFileType)
    .toArray()
  const duplicate =
    candidates.find((b) => b.fileSignature === signature && b.status !== 'cancelled') ?? null
  return { duplicate, fileSignature: signature, buffer }
}

export interface RunImportParams {
  file: File
  buffer: ArrayBuffer
  fileSignature: string
  sourceFileType: SourceFileType
  mapping: Partial<Record<StandardFieldId, string>>
  replacedBatchId?: string
  onProgress: (event: ImportProgressEvent) => void
}

export interface RunImportResult {
  batch: ImportBatch
}

/**
 * Rulează importul complet: parsare+validare+normalizare+identificare
 * clienți/produse (worker) apoi salvare (Dexie). Identificarea (spec §5) e
 * memoizată pe denumire în worker, dar crearea efectivă a clienților/
 * produselor noi și a intrărilor din coada de verificare se face pe main
 * thread (Dexie), între faza de scanare și cea de scriere finală.
 */
export function runImport(params: RunImportParams): Promise<RunImportResult> {
  const { file, buffer, fileSignature, sourceFileType, mapping, replacedBatchId, onProgress } = params
  const importBatchId = crypto.randomUUID()
  // Pentru importul consolidat, canalul e per tranzacție (coloana "Canal"),
  // nu per fișier — batch-ul e etichetat "MIXT" doar pentru afișare în istoric.
  const channel = sourceFileType === 'CONSOLIDATED' ? 'MIXT' : channelForSourceFile(sourceFileType)

  return new Promise((resolve, reject) => {
    const worker = createWorker()
    const requestId = newRequestId()
    const pendingSaves: Promise<void>[] = []
    let saved = 0
    let totalSoFarEstimate = 0

    const flushChunk = (records: TransactionRecord[]) => {
      totalSoFarEstimate += records.length
      const promise = (async () => {
        for (let i = 0; i < records.length; i += SAVE_CHUNK_SIZE) {
          const slice = records.slice(i, i + SAVE_CHUNK_SIZE)
          await db.transactions.bulkAdd(slice)
          saved += slice.length
          onProgress({ stage: 'salvare', processed: saved, total: totalSoFarEstimate })
        }
      })()
      pendingSaves.push(promise)
    }

    worker.onmessage = async (event: MessageEvent<any>) => {
      const msg = event.data
      if (msg.requestId !== requestId) return

      if (msg.type === 'progress') {
        onProgress({ stage: msg.stage, processed: msg.processed, total: msg.total })
        return
      }

      if (msg.type === 'resolution-summary') {
        try {
          const [clientIdMap, productIdMap] = await Promise.all([
            applyClientResolutions(msg.newClients, msg.queueUpserts),
            applyProductResolutions(msg.newProducts),
          ])
          worker.postMessage({ type: 'resolve-ids', requestId, clientIdMap, productIdMap })
        } catch (err) {
          worker.terminate()
          reject(err instanceof Error ? err : new Error(String(err)))
        }
        return
      }

      if (msg.type === 'chunk') {
        flushChunk(msg.records as TransactionRecord[])
        return
      }

      if (msg.type === 'error') {
        worker.terminate()
        reject(new Error(msg.message))
        return
      }

      if (msg.type === 'done') {
        try {
          await Promise.all(pendingSaves)
          onProgress({ stage: 'recalculare-agregari', processed: 1, total: 1 })

          const errors: RejectedRow[] = msg.errors
          const status: ImportBatch['status'] =
            msg.importedRows === 0 ? 'failed' : errors.length > 0 ? 'partial' : 'success'

          const batch: ImportBatch = {
            id: importBatchId,
            createdAt: Date.now(),
            fileName: file.name,
            sourceFileType,
            channel,
            fileSignature,
            rowsSignature: msg.rowsSignature,
            totalRows: msg.totalRows,
            importedRows: msg.importedRows,
            rejectedRows: msg.rejectedRows,
            status,
            periodStart: msg.periodStart ?? undefined,
            periodEnd: msg.periodEnd ?? undefined,
            replacedBatchId,
            columnMapping: mapping as Record<string, string>,
            errors,
          }

          await db.importBatches.put(batch)
          onProgress({ stage: 'finalizat', processed: 1, total: 1 })
          worker.terminate()
          resolve({ batch })
        } catch (err) {
          worker.terminate()
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }

    Promise.all([loadClientSnapshot(), loadProductSnapshot()]).then(([clientSnapshot, productSnapshot]) => {
      worker.postMessage(
        {
          type: 'process',
          requestId,
          buffer,
          sourceFileType,
          sourceFile: file.name,
          importBatchId,
          mapping,
          clientSnapshot,
          productSnapshot,
        },
        [buffer],
      )
    })
  })
}

/** Șterge complet un batch de import, fără să afecteze celelalte luni (spec §12, §33). */
export async function deleteImportBatch(batchId: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.importBatches, async () => {
    await db.transactions.where('importBatchId').equals(batchId).delete()
    await db.importBatches.delete(batchId)
  })
}
