import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import {
  blacklistCandidate,
  confirmQueueMatch,
  createClientFromQueue,
  ignoreQueueEntry,
  reopenQueueEntry,
} from '../nomenclature/clientService'
import { formatNumber } from '../lib/ro-format'

export function ClientMatchQueuePage() {
  const [showIgnored, setShowIgnored] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const entries = useLiveQuery(
    () => db.clientMatchQueue.where('status').equals(showIgnored ? 'ignored' : 'pending').toArray(),
    [showIgnored],
  )

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const sorted = entries?.slice().sort((a, b) => b.occurrences - a.occurrences)

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">Potriviri clienți</h1>
        <button
          className="text-xs text-slate-500 hover:underline"
          onClick={() => setShowIgnored((v) => !v)}
        >
          {showIgnored ? 'vezi în așteptare' : 'vezi ignorate'}
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Denumiri de clienți care nu au putut fi identificate automat cu certitudine (spec §7). Fuzzy
        matching-ul doar propune — nicio asociere nu se face automat doar pe bază de scor.
      </p>

      {!sorted ? (
        <div className="text-sm text-slate-500">Se încarcă…</div>
      ) : sorted.length === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          {showIgnored ? 'Nicio intrare ignorată.' : 'Nicio denumire în așteptare — toate rândurile importate au fost identificate.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((entry) => (
            <div key={entry.normalizedName} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="flex items-baseline justify-between mb-2">
                <div className="font-medium">{entry.rawName}</div>
                <div className="text-xs text-slate-500">
                  {formatNumber(entry.occurrences)} rânduri
                  {entry.clientCode ? ` · cod ${entry.clientCode}` : ''}
                  {entry.cui ? ` · CUI ${entry.cui}` : ''}
                </div>
              </div>

              {entry.candidates.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {entry.candidates.map((c) => {
                    const key = `${entry.normalizedName}:confirm:${c.clientId}`
                    return (
                      <div key={c.clientId} className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-900 rounded px-3 py-1.5">
                        <span>
                          {c.canonicalName} <span className="text-slate-400">— {c.score}%</span>
                        </span>
                        <span className="flex gap-2">
                          <button
                            className="text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
                            disabled={busy !== null}
                            onClick={() => run(key, () => confirmQueueMatch(entry.normalizedName, c.clientId))}
                          >
                            Este {c.canonicalName}
                          </button>
                          <button
                            className="text-slate-400 hover:underline disabled:opacity-50"
                            disabled={busy !== null}
                            onClick={() =>
                              run(`${key}:blacklist`, () => blacklistCandidate(entry.normalizedName, c.clientId))
                            }
                          >
                            nu mai propune
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-3 text-xs">
                {showIgnored ? (
                  <button
                    className="text-slate-600 dark:text-slate-300 hover:underline disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => run(`${entry.normalizedName}:reopen`, () => reopenQueueEntry(entry.normalizedName))}
                  >
                    readu în așteptare
                  </button>
                ) : (
                  <>
                    <button
                      className="text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => run(`${entry.normalizedName}:new`, () => createClientFromQueue(entry.normalizedName))}
                    >
                      Creează client nou „{entry.rawName}"
                    </button>
                    <button
                      className="text-slate-500 hover:underline disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => run(`${entry.normalizedName}:ignore`, () => ignoreQueueEntry(entry.normalizedName))}
                    >
                      Ignoră
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
