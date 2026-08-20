import { useEffect, useMemo, useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { DrillDownModal } from '@/components/ui/DrillDownModal'
import { useDataStore } from '@/store/dataStore'
import { updateSettings } from '@/data/repo/settings'
import { listPendingReportMonths } from '@/reports/reportAvailability'

export function AppShell() {
  const { refresh, loaded, transactions, settings } = useDataStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  const pendingReports = useMemo(
    () => listPendingReportMonths(transactions, settings?.reportsAcknowledged ?? []),
    [transactions, settings],
  )

  async function dismissReports() {
    const current = settings?.reportsAcknowledged ?? []
    await updateSettings({ reportsAcknowledged: [...current, ...pendingReports.map((m) => m.key)] })
    await refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="hidden md:block">
        <Sidebar pendingReports={pendingReports.length} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <Sidebar onNavigate={() => setMobileOpen(false)} pendingReports={pendingReports.length} />
          <div className="flex-1 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md border border-slate-200 p-1.5 text-slate-600"
            aria-label="Meniu"
          >
            ☰
          </button>
          <span className="text-sm font-semibold">PECO Dashboard</span>
        </header>

        {loaded && pendingReports.length > 0 && (
          <div className="flex items-center gap-3 border-b border-warn/20 bg-warn/10 px-4 py-2 text-sm text-warn md:px-8">
            <span className="text-base">🧾</span>
            <span className="flex-1">
              {pendingReports.length === 1
                ? `Ai de ridicat raportul pentru ${pendingReports[0].label}.`
                : `Ai de ridicat ${pendingReports.length} rapoarte (cel mai recent: ${pendingReports[0].label}).`}
            </span>
            <Link to="/rapoarte" className="whitespace-nowrap rounded-md bg-warn px-3 py-1 text-xs font-semibold text-white hover:bg-warn/90">
              Vezi rapoarte
            </Link>
            <button onClick={dismissReports} className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-warn hover:bg-warn/10" title="Marchează ca ridicate">
              Am notat, ascunde
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6 scrollbar-thin">
          {!loaded ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">Se încarcă datele...</div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <DrillDownModal />
    </div>
  )
}
