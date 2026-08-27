import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useState } from 'react'
import { db } from '../db/db'
import { deleteImportBatch } from '../import/importEngine'
import { downloadCsv } from '../lib/csv'
import { formatDate, formatNumber } from '../lib/ro-format'
import { sourceFileLabel } from '../types'
import type { ImportBatch, ImportBatchStatus } from '../types'

const STATUS_LABEL: Record<ImportBatchStatus, string> = {
  processing: 'În curs',
  success: 'Reușit',
  partial: 'Parțial',
  failed: 'Eșuat',
  cancelled: 'Anulat',
}

const STATUS_STYLE: Record<ImportBatchStatus, string> = {
  processing: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

export function ImportHistoryPage() {
  const batches = useLiveQuery(() => db.importBatches.orderBy('createdAt').reverse().toArray(), [])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(batch: ImportBatch) {
    if (!confirm(`Ștergi importul "${batch.fileName}" (${formatNumber(batch.importedRows)} rânduri)? Celelalte luni nu sunt afectate.`)) {
      return
    }
    setDeleting(batch.id)
    try {
      await deleteImportBatch(batch.id)
    } finally {
      setDeleting(null)
    }
  }

  function handleDownloadRejected(batch: ImportBatch) {
    downloadCsv(
      `respinse_${batch.fileName.replace(/\.[^.]+$/, '')}.csv`,
      ['Rând Excel', 'Motiv', 'Date brute'],
      batch.errors.map((e) => [e.rowNumber, e.reason, JSON.stringify(e.raw)]),
    )
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Istoric importuri</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Toate importurile efectuate. Ștergerea unui import elimină doar rândurile acelui batch, fără
        să afecteze celelalte luni.
      </p>

      {!batches ? (
        <div className="text-sm text-slate-500">Se încarcă…</div>
      ) : batches.length === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          Nu există încă niciun import. Mergi la „Import date" pentru a încărca primul fișier.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Dată import</th>
                <th className="px-3 py-2 text-left">Perioadă</th>
                <th className="px-3 py-2 text-left">Fișier</th>
                <th className="px-3 py-2 text-left">Canal</th>
                <th className="px-3 py-2 text-right">Rânduri</th>
                <th className="px-3 py-2 text-right">Importate</th>
                <th className="px-3 py-2 text-right">Respinse</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <Fragment key={batch.id}>
                  <tr className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(new Date(batch.createdAt).toISOString().slice(0, 10))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {batch.periodStart ? formatDate(batch.periodStart) : '—'} – {batch.periodEnd ? formatDate(batch.periodEnd) : '—'}
                    </td>
                    <td className="px-3 py-2">{batch.fileName}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sourceFileLabel(batch.sourceFileType)}
                      <span className="text-slate-400"> → {batch.channel}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(batch.totalRows)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(batch.importedRows)}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(batch.rejectedRows)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[batch.status]}`}>
                        {STATUS_LABEL[batch.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {batch.rejectedRows > 0 && (
                        <button
                          className="text-xs text-slate-600 dark:text-slate-300 hover:underline mr-3"
                          onClick={() => setExpanded(expanded === batch.id ? null : batch.id)}
                        >
                          {expanded === batch.id ? 'ascunde erori' : 'vezi erori'}
                        </button>
                      )}
                      <button
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                        disabled={deleting === batch.id}
                        onClick={() => handleDelete(batch)}
                      >
                        șterge
                      </button>
                    </td>
                  </tr>
                  {expanded === batch.id && batch.errors.length > 0 && (
                    <tr className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                      <td colSpan={9} className="px-3 py-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium">
                            {formatNumber(batch.errors.length)} rânduri respinse
                          </span>
                          <button
                            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                            onClick={() => handleDownloadRejected(batch)}
                          >
                            descarcă rândurile respinse (CSV)
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto text-xs">
                          <table className="w-full">
                            <thead className="text-slate-500">
                              <tr>
                                <th className="text-left px-2 py-1">Rând</th>
                                <th className="text-left px-2 py-1">Motiv</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batch.errors.slice(0, 200).map((err, i) => (
                                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                                  <td className="px-2 py-1">{err.rowNumber}</td>
                                  <td className="px-2 py-1">{err.reason}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {batch.errors.length > 200 && (
                            <div className="text-slate-400 mt-1">
                              … și încă {formatNumber(batch.errors.length - 200)}. Descarcă CSV pentru lista completă.
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
