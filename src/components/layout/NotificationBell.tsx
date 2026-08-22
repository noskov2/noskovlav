import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useDataStore } from '@/store/dataStore'
import { computeImportGaps } from '@/kpi/importGaps'

// There is no backend and the app can't run while the tab is closed, so
// this is a live check recomputed on every open — not a scheduled daily
// push. It answers "what's missing right now", which is the honest version
// of "notifică-mă zilnic" achievable in a 100%-local, no-server app.
export function NotificationBell() {
  const { transactions, stockSnapshots, supplierReceipts } = useDataStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const gaps = useMemo(
    () => computeImportGaps(transactions, stockSnapshots, supplierReceipts),
    [transactions, stockSnapshots, supplierReceipts],
  )

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-slate-100"
        title="Notificări"
        aria-label="Notificări"
      >
        🔔
        {gaps.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">
            {gaps.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Notificări</p>
            <p className="text-[11px] text-slate-400">verificat acum</p>
          </div>
          {gaps.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Totul e la zi — nimic de importat.</p>
          ) : (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto">
              {gaps.map((gap, i) => (
                <li key={i}>
                  <Link
                    to={`/import?kind=${gap.kind}`}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition hover:opacity-80',
                      gap.severity === 'bad' ? 'border-bad/20 bg-bad/5 text-bad' : 'border-warn/20 bg-warn/5 text-warn',
                    )}
                  >
                    <span>{gap.icon}</span>
                    <span className="text-slate-700">{gap.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] leading-snug text-slate-400">
            Aplicația nu poate trimite notificări reale în fundal (nu are server) — lista se recalculează de fiecare
            dată când deschizi aplicația.
          </p>
        </div>
      )}
    </div>
  )
}
