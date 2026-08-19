import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { DrillDownModal } from '@/components/ui/DrillDownModal'
import { useDataStore } from '@/store/dataStore'

export function AppShell() {
  const { refresh, loaded } = useDataStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
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
