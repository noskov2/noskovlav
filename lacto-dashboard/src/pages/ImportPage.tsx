import { useRef, useState } from 'react'
import { ColumnMappingModal } from '../components/ColumnMappingModal'
import { DuplicateFileDialog } from '../components/DuplicateFileDialog'
import { FileDropZone } from '../components/FileDropZone'
import {
  checkDuplicateFile,
  deleteImportBatch,
  detectHeaders,
  findRememberedMapping,
  runImport,
  saveMapping,
} from '../import/importEngine'
import { STAGE_LABELS, STAGE_ORDER } from '../import/stages'
import { formatNumber } from '../lib/ro-format'
import { SOURCE_FILE_TYPES } from '../types'
import type { ImportBatch, ImportProgressEvent, SourceFileType, StandardFieldId } from '../types'

type SlotStatus =
  | 'idle'
  | 'detecting'
  | 'mapping'
  | 'duplicate-check'
  | 'duplicate-confirm'
  | 'importing'
  | 'done'
  | 'error'

interface SlotState {
  file: File | null
  status: SlotStatus
  progress?: ImportProgressEvent
  error?: string
  batch?: ImportBatch
}

interface MappingRequest {
  sourceFileType: SourceFileType
  headers: string[]
  sample: unknown[][]
  suggestion: Partial<Record<StandardFieldId, string>>
}

interface DuplicateRequest {
  sourceFileType: SourceFileType
  batch: ImportBatch
}

const initialSlots: Record<SourceFileType, SlotState> = Object.fromEntries(
  SOURCE_FILE_TYPES.map((s) => [s.id, { file: null, status: 'idle' as SlotStatus }]),
) as Record<SourceFileType, SlotState>

export function ImportPage() {
  const [slots, setSlots] = useState<Record<SourceFileType, SlotState>>(initialSlots)
  const [mappingRequest, setMappingRequest] = useState<MappingRequest | null>(null)
  const [duplicateRequest, setDuplicateRequest] = useState<DuplicateRequest | null>(null)

  const mappingResolverRef = useRef<
    ((mapping: Partial<Record<StandardFieldId, string>> | null) => void) | null
  >(null)
  const duplicateResolverRef = useRef<((choice: 'cancel' | 'anyway' | 'replace') => void) | null>(null)
  const chainRef = useRef<Promise<void>>(Promise.resolve())

  function updateSlot(type: SourceFileType, patch: Partial<SlotState>) {
    setSlots((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }))
  }

  function handleFile(type: SourceFileType, file: File) {
    updateSlot(type, { file, status: 'detecting', error: undefined, batch: undefined, progress: undefined })
    chainRef.current = chainRef.current
      .then(() => processFile(type, file))
      .catch((err: unknown) => {
        updateSlot(type, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      })
  }

  async function processFile(type: SourceFileType, file: File) {
    const { headers, sample, suggestion } = await detectHeaders(file)
    const remembered = await findRememberedMapping(type, headers)

    let mapping: Partial<Record<StandardFieldId, string>>
    if (remembered) {
      mapping = remembered.mapping
    } else {
      updateSlot(type, { status: 'mapping' })
      const chosen = await new Promise<Partial<Record<StandardFieldId, string>> | null>((resolve) => {
        mappingResolverRef.current = resolve
        setMappingRequest({ sourceFileType: type, headers, sample, suggestion })
      })
      setMappingRequest(null)
      mappingResolverRef.current = null
      if (!chosen) {
        updateSlot(type, { status: 'idle' })
        return
      }
      mapping = chosen
      await saveMapping(type, headers, mapping)
    }

    updateSlot(type, { status: 'duplicate-check' })
    const { duplicate, fileSignature, buffer } = await checkDuplicateFile(file, type)

    let replacedBatchId: string | undefined
    if (duplicate) {
      updateSlot(type, { status: 'duplicate-confirm' })
      const choice = await new Promise<'cancel' | 'anyway' | 'replace'>((resolve) => {
        duplicateResolverRef.current = resolve
        setDuplicateRequest({ sourceFileType: type, batch: duplicate })
      })
      setDuplicateRequest(null)
      duplicateResolverRef.current = null
      if (choice === 'cancel') {
        updateSlot(type, { status: 'idle' })
        return
      }
      if (choice === 'replace') {
        await deleteImportBatch(duplicate.id)
        replacedBatchId = duplicate.id
      }
    }

    updateSlot(type, { status: 'importing', progress: undefined })
    const { batch } = await runImport({
      file,
      buffer,
      fileSignature,
      sourceFileType: type,
      mapping,
      replacedBatchId,
      onProgress: (event) => updateSlot(type, { progress: event }),
    })
    updateSlot(type, { status: 'done', batch })
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Import date</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Trage sau selectează exporturile lunare din Mentor. Poți alege toate cele 4 fișiere deodată —
        fiecare este procesat automat: citire, validare, normalizare, salvare.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SOURCE_FILE_TYPES.filter((source) => source.id !== 'CONSOLIDATED').map((source) => {
          const slot = slots[source.id]
          return (
            <div key={source.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <FileDropZone
                label={source.label}
                disabled={slot.status !== 'idle' && slot.status !== 'error' && slot.status !== 'done'}
                fileName={slot.file?.name}
                onFile={(file) => handleFile(source.id, file)}
              />
              <SlotStatusView slot={slot} />
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        <span className="text-xs text-slate-400">SAU</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Dacă ai deja datele unificate pe toate cele 3 canale într-un singur fișier (canal, client,
        categorie/subcategorie proprii per rând), importă-l direct aici — în loc de cele 4 fișiere de
        mai sus.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SOURCE_FILE_TYPES.filter((source) => source.id === 'CONSOLIDATED').map((source) => {
          const slot = slots[source.id]
          return (
            <div key={source.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <FileDropZone
                label={source.label}
                disabled={slot.status !== 'idle' && slot.status !== 'error' && slot.status !== 'done'}
                fileName={slot.file?.name}
                onFile={(file) => handleFile(source.id, file)}
              />
              <SlotStatusView slot={slot} />
            </div>
          )
        })}
      </div>

      {mappingRequest && (
        <ColumnMappingModal
          sourceFileType={mappingRequest.sourceFileType}
          headers={mappingRequest.headers}
          sample={mappingRequest.sample}
          suggestion={mappingRequest.suggestion}
          onConfirm={(mapping) => mappingResolverRef.current?.(mapping)}
          onCancel={() => mappingResolverRef.current?.(null)}
        />
      )}

      {duplicateRequest && (
        <DuplicateFileDialog
          batch={duplicateRequest.batch}
          onChoice={(choice) => duplicateResolverRef.current?.(choice)}
        />
      )}
    </div>
  )
}

function SlotStatusView({ slot }: { slot: SlotState }) {
  if (slot.status === 'idle') return null

  if (slot.status === 'error') {
    return <div className="mt-3 text-sm text-rose-600 dark:text-rose-400">Eroare: {slot.error}</div>
  }

  if (slot.status === 'done' && slot.batch) {
    const b = slot.batch
    return (
      <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
        Import finalizat: {formatNumber(b.importedRows)} rânduri importate
        {b.rejectedRows > 0 ? `, ${formatNumber(b.rejectedRows)} respinse` : ''}.
      </div>
    )
  }

  if (slot.status === 'mapping') {
    return <div className="mt-3 text-sm text-slate-500">Se așteaptă confirmarea mapării coloanelor…</div>
  }

  if (slot.status === 'duplicate-confirm') {
    return <div className="mt-3 text-sm text-amber-600">Se așteaptă decizia privind fișierul duplicat…</div>
  }

  const stage = slot.progress?.stage
  const pct =
    slot.progress && slot.progress.total > 0
      ? Math.round((slot.progress.processed / slot.progress.total) * 100)
      : slot.status === 'detecting' || slot.status === 'duplicate-check'
        ? 0
        : 100

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
        <span>{stage ? STAGE_LABELS[stage] : slot.status === 'detecting' ? 'Citire fișier' : 'Verificare duplicat'}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {STAGE_ORDER.map((s) => (
          <span
            key={s}
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              s === stage
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  )
}
