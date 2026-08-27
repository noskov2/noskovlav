import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { computeAlerts } from '../analytics/alerts'
import type { Alert } from '../analytics/alerts'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'

const SEVERITY_ICON = { red: '🔴', amber: '🟠', green: '🟢' } as const
const SEVERITY_ORDER = { red: 0, amber: 1, green: 2 } as const

/** Alerte & Insight-uri (spec §27) — calculate din date, nu texte hardcodate. */
export function AlertsPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<Alert[] | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setAlerts(undefined)
    computeAlerts(filters).then((a) => {
      if (!cancelled) setAlerts(a.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  return (
    <ReportShell
      title="Alerte & Insight-uri"
      description="Semnale generate automat din datele importate: clienți în creștere/scădere semnificativă, inactivitate, produse care pierd clienți, prețuri sub medie."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {() =>
        alerts === undefined ? (
          <div className="text-sm text-slate-500">Se calculează…</div>
        ) : alerts.length === 0 ? (
          <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
            Nicio alertă pentru filtrele curente — nu s-au găsit variații semnificative.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`border rounded-lg p-3 flex items-start gap-3 ${
                  a.link ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900' : ''
                } border-slate-200 dark:border-slate-800`}
                onClick={() => a.link && navigate(`/${a.link.type === 'client' ? 'clienti' : 'produse'}/${a.link.id}`)}
              >
                <span className="text-lg leading-none mt-0.5">{SEVERITY_ICON[a.severity]}</span>
                <span className="text-sm">{a.message}</span>
              </div>
            ))}
          </div>
        )
      }
    </ReportShell>
  )
}
