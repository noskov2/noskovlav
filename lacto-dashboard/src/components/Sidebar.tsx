import { useLiveQuery } from 'dexie-react-hooks'
import { NavLink } from 'react-router-dom'
import { db } from '../db/db'

interface NavItem {
  label: string
  path?: string
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

export function Sidebar() {
  const pendingCount = useLiveQuery(() => db.clientMatchQueue.where('status').equals('pending').count(), [])

  const SECTIONS: NavSection[] = [
    {
      title: 'GENERAL',
      items: [{ label: 'Dashboard', path: '/dashboard' }, { label: 'Alerte', path: '/alerte' }],
    },
    {
      title: 'ANALIZE',
      items: [
        { label: 'Vânzări' },
        { label: 'Clienți', path: '/clienti' },
        { label: 'Produse', path: '/produse' },
        { label: 'Categorii', path: '/categorii' },
        { label: 'Canale', path: '/canale' },
        { label: 'Analiză lunară', path: '/analiza-lunara' },
        { label: 'Sezonalitate', path: '/sezonalitate' },
        { label: 'Prețuri', path: '/preturi' },
        { label: 'Outlieri preț', path: '/outlieri-pret' },
        { label: 'Pareto / ABC', path: '/pareto' },
        { label: 'Dinamica clienților', path: '/dinamica-clienti' },
        { label: 'Matrice creștere', path: '/matrice-crestere' },
        { label: 'Risc concentrare', path: '/risc-concentrare' },
        { label: 'Cross-sell', path: '/cross-sell' },
      ],
    },
    {
      title: 'RAPOARTE',
      items: [
        { label: 'Generator raport', path: '/generator-raport' },
        { label: 'Rapoarte salvate', path: '/rapoarte-salvate' },
        { label: 'Executive report', path: '/executive-report' },
      ],
    },
    {
      title: 'DATE',
      items: [
        { label: 'Import catalog produse', path: '/import-catalog-produse' },
        { label: 'Import date', path: '/import' },
        { label: 'Istoric importuri', path: '/importuri' },
        { label: 'Potriviri clienți', path: '/potriviri-clienti', badge: pendingCount },
        { label: 'Nomenclator clienți', path: '/nomenclator-clienti' },
        { label: 'Nomenclator produse', path: '/nomenclator-produse' },
        { label: 'Calitatea datelor', path: '/calitatea-datelor' },
      ],
    },
    {
      title: 'SISTEM',
      items: [{ label: 'Backup', path: '/backup' }, { label: 'Setări' }],
    },
  ]

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white h-full overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
      <div className="px-5 py-5 flex items-center gap-2.5">
        <span className="h-8 w-8 shrink-0 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-semibold">
          L
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">Lacto Dashboard</div>
          <div className="text-xs text-slate-400 dark:text-slate-400">Lacto Solomonescu</div>
        </div>
      </div>
      <nav className="px-3 pb-8">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="px-2 mb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.label}>
                  {item.path ? (
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors ${
                          isActive
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`
                      }
                    >
                      <span>{item.label}</span>
                      {!!item.badge && (
                        <span className="text-[10px] rounded-full bg-amber-500 text-white px-1.5 py-0.5 leading-none">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  ) : (
                    <div
                      className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-slate-400 dark:text-slate-600 cursor-not-allowed select-none"
                      title="Disponibil într-o etapă viitoare"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                        curând
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
