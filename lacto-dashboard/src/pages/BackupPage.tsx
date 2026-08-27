import { useRef, useState } from 'react'
import type { TableSummary } from '../backup/backupService'
import { exportBackup, restoreBackup } from '../backup/backupService'
import { formatNumber } from '../lib/ro-format'

type Status = { kind: 'idle' } | { kind: 'busy'; label: string } | { kind: 'done'; label: string; summary: TableSummary[] } | { kind: 'error'; message: string }

/** Backup / Restore (spec §32): export/import complet al bazei de date locale, în JSON. */
export function BackupPage() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setStatus({ kind: 'busy', label: 'Se generează backup-ul…' })
    try {
      const summary = await exportBackup()
      setStatus({ kind: 'done', label: 'Backup descărcat cu succes.', summary })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function handlePickRestoreFile() {
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!confirm('Restaurarea unui backup ȘTERGE toate datele curente (tranzacții, nomenclatoare, rapoarte salvate) și le înlocuiește cu conținutul fișierului. Continui?')) {
      return
    }
    setStatus({ kind: 'busy', label: 'Se restaurează backup-ul…' })
    try {
      const summary = await restoreBackup(file)
      setStatus({ kind: 'done', label: 'Restaurare finalizată. Pagina se va reîncărca.', summary })
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Backup / Restore</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Toate datele aplicației (tranzacții, nomenclatoare clienți/produse, coadă de verificare, mapări de import,
        istoric importuri, rapoarte salvate) sunt stocate local, în browser. Exportă un backup periodic sau înainte
        de a schimba calculatorul.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-sm font-medium mb-1">Export backup</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Descarcă un fișier .json cu tot conținutul bazei de date curente.
          </p>
          <button
            onClick={handleExport}
            disabled={status.kind === 'busy'}
            className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            Descarcă backup
          </button>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-sm font-medium mb-1">Restaurare backup</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Alege un fișier .json exportat anterior. <strong>Înlocuiește complet</strong> datele curente.
          </p>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFileSelected} />
          <button
            onClick={handlePickRestoreFile}
            disabled={status.kind === 'busy'}
            className="rounded-md border border-rose-300 text-rose-600 dark:border-rose-800 dark:text-rose-400 px-4 py-2 text-sm hover:bg-rose-50 dark:hover:bg-rose-950 disabled:opacity-50"
          >
            Restaurează din fișier…
          </button>
        </div>
      </div>

      {status.kind === 'busy' && <div className="text-sm text-slate-500">{status.label}</div>}

      {status.kind === 'error' && (
        <div className="text-sm text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg p-4">
          Eroare: {status.message}
        </div>
      )}

      {status.kind === 'done' && (
        <div>
          <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-3">{status.label}</div>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Tabelă</th>
                  <th className="px-3 py-2 text-right font-medium">Rânduri</th>
                </tr>
              </thead>
              <tbody>
                {status.summary.map((s) => (
                  <tr key={s.tableName} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-1.5 font-mono text-xs">{s.tableName}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumber(s.rowCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
