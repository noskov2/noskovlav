import { formatDate, formatNumber } from '../lib/ro-format'
import type { ImportBatch } from '../types'

interface Props {
  batch: ImportBatch
  onChoice: (choice: 'cancel' | 'anyway' | 'replace') => void
}

export function DuplicateFileDialog({ batch, onChoice }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 shadow-xl p-6">
        <h2 className="text-lg font-semibold mb-2 text-amber-600 dark:text-amber-400">
          Acest fișier pare să fi fost importat anterior
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Fișierul <strong>{batch.fileName}</strong> a fost importat pe {formatDate(new Date(batch.createdAt).toISOString().slice(0, 10))}{' '}
          ({formatNumber(batch.importedRows)} rânduri, perioadă {batch.periodStart ? formatDate(batch.periodStart) : '—'}
          {' – '}
          {batch.periodEnd ? formatDate(batch.periodEnd) : '—'}).
        </p>
        <div className="flex flex-col gap-2">
          <button
            className="px-4 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={() => onChoice('cancel')}
          >
            Anulează importul
          </button>
          <button
            className="px-4 py-2 text-sm rounded-md border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950"
            onClick={() => onChoice('anyway')}
          >
            Importă oricum (păstrează ambele)
          </button>
          <button
            className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => onChoice('replace')}
          >
            Înlocuiește importul precedent
          </button>
        </div>
      </div>
    </div>
  )
}
