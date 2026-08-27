import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { REPORT_DIMENSIONS } from '../analytics/genericBreakdown'
import { deleteSavedReport, listSavedReports } from '../analytics/savedReportsService'
import { formatDate } from '../lib/ro-format'

/** Rapoarte salvate (spec §30): preseturi complete de filtre create din Generatorul de rapoarte. */
export function SavedReportsPage() {
  const reports = useLiveQuery(() => listSavedReports(), [])

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Ștergi raportul salvat „${name}"?`)) return
    await deleteSavedReport(id)
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Rapoarte salvate</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Preseturi de filtre, dimensiune și indicatori salvate din{' '}
        <Link to="/generator-raport" className="text-emerald-700 dark:text-emerald-400 hover:underline">
          Generatorul de rapoarte
        </Link>
        .
      </p>

      {reports === undefined ? (
        <div className="text-sm text-slate-500">Se încarcă…</div>
      ) : reports.length === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          Nu ai salvat încă niciun raport. Mergi la Generatorul de rapoarte și apasă „Salvează raportul".
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Denumire</th>
                <th className="px-3 py-2 text-left font-medium">Dimensiune</th>
                <th className="px-3 py-2 text-left font-medium">Creat la</th>
                <th className="px-3 py-2 text-right font-medium">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((rep) => (
                <tr key={rep.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-1.5 font-medium">{rep.name}</td>
                  <td className="px-3 py-1.5 text-slate-500">
                    {REPORT_DIMENSIONS.find((d) => d.id === rep.config.dimension)?.label ?? rep.config.dimension}
                  </td>
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{formatDate(new Date(rep.createdAt).toISOString().slice(0, 10))}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <Link to={`/generator-raport?report=${rep.id}`} className="text-emerald-700 dark:text-emerald-400 hover:underline mr-4">
                      Deschide
                    </Link>
                    <button className="text-rose-600 dark:text-rose-400 hover:underline" onClick={() => handleDelete(rep.id!, rep.name)}>
                      Șterge
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
