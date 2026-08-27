import { useEffect, useState } from 'react'
import { computeDataQuality } from '../analytics/dataQuality'
import type { DataQualityResult, IssueSeverity } from '../analytics/dataQuality'
import { formatNumber } from '../lib/ro-format'

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  high: 'Critic',
  medium: 'Atenție',
  low: 'Minor',
}

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

/** Calitatea datelor (spec §28): scor 0-100 calculat pe toate datele importate, plus lista problemelor de rezolvat. */
export function DataQualityPage() {
  const [result, setResult] = useState<DataQualityResult | null | undefined>(undefined)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setResult(undefined)
    computeDataQuality().then((r) => {
      if (!cancelled) setResult(r)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  function recompute() {
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Calitatea datelor</h1>
        <button
          onClick={recompute}
          className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          Recalculează
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Scor calculat pe toate tranzacțiile și nomenclatoarele din baza de date, indiferent de perioadă.
      </p>

      {result === undefined ? (
        <div className="text-sm text-slate-500">Se calculează…</div>
      ) : result === null ? null : result.totalTransactions === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          Nu există date importate încă. Mergi la „Import date" pentru a începe.
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 md:col-span-1 flex flex-col items-center justify-center">
              <div className={`text-4xl font-bold ${scoreColor(result.score)}`}>{result.score}</div>
              <div className="text-xs text-slate-400 mt-1">din 100</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 md:col-span-3 flex flex-col justify-center">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {formatNumber(result.totalTransactions)} tranzacții analizate · {result.issues.length}{' '}
                {result.issues.length === 1 ? 'problemă identificată' : 'probleme identificate'}
              </div>
              {result.issues.length === 0 && (
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                  Nu au fost identificate probleme de calitate a datelor.
                </div>
              )}
            </div>
          </div>

          {result.issues.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Severitate</th>
                    <th className="px-3 py-2 text-left font-medium">Categorie</th>
                    <th className="px-3 py-2 text-left font-medium">Detalii</th>
                    <th className="px-3 py-2 text-right font-medium">Cantitate</th>
                  </tr>
                </thead>
                <tbody>
                  {result.issues.map((issue, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${SEVERITY_COLOR[issue.severity]}`}>
                          {SEVERITY_LABEL[issue.severity]}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{issue.category}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{issue.message}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatNumber(issue.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
