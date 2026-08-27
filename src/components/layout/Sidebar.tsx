import { NavLink } from 'react-router-dom'
import clsx from 'clsx'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
}

const items: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/import', label: 'Import date', icon: '📥' },
  { to: '/vanzare-slaba', label: 'Vânzare slabă', icon: '🐢' },
  { to: '/stoc', label: 'Stoc & Rotație', icon: '📦' },
  { to: '/zi', label: 'Zi de vânzare', icon: '📅' },
  { to: '/comparatie-lunara', label: 'Comparație lunară', icon: '📈' },
  { to: '/profitabilitate', label: 'Profitabilitate', icon: '💰' },
  { to: '/cross-sell', label: 'Cross-sell & Casieri', icon: '🤝' },
  { to: '/bonuri', label: 'Vânzări & Bonuri', icon: '🛒' },
  { to: '/furnizori', label: 'Furnizori & Prețuri', icon: '🚚' },
  { to: '/rapoarte', label: 'Rapoarte', icon: '🧾' },
  { to: '/inchidere-luna', label: 'Închidere lună', icon: '🔒' },
  { to: '/targeturi', label: 'Target', icon: '🎯' },
  { to: '/condica-pv', label: 'Condică PV-uri', icon: '📋' },
  { to: '/calitate-date', label: 'Calitatea datelor', icon: '✅' },
  { to: '/nomenclator', label: 'Nomenclator', icon: '🗂️' },
  { to: '/setari', label: 'Setări', icon: '⚙️' },
]

export function Sidebar({ onNavigate, pendingReports = 0 }: { onNavigate?: () => void; pendingReports?: number }) {
  return (
    <div className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-white">
          P
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">PECO Dashboard</p>
          <p className="text-xs text-slate-400">Management stație</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )
            }
          >
            <span className="text-base">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.to === '/rapoarte' && pendingReports > 0 && (
              <span className="rounded-full bg-warn px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingReports}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 px-4 py-3 text-[11px] leading-snug text-slate-400">
        Datele sunt salvate local (IndexedDB), în acest browser.
      </div>
    </div>
  )
}
