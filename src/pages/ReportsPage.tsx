import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDataStore } from '@/store/dataStore'
import { updateSettings } from '@/data/repo/settings'
import { listAvailableMonths } from '@/reports/reportAvailability'
import { computeMonthlyReportData } from '@/reports/monthlyReportData'
import { downloadMonthlyReport } from '@/reports/monthlyReportWorkbook'
import { formatNumber } from '@/lib/format'

export function ReportsPage() {
  const { transactions, products, settings, refresh } = useDataStore()
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)

  const months = useMemo(() => listAvailableMonths(transactions), [transactions])
  const acknowledged = new Set(settings?.reportsAcknowledged ?? [])

  async function handleDownload(year: number, month: number, key: string) {
    setDownloadingKey(key)
    try {
      const data = computeMonthlyReportData(year, month, transactions, products)
      await downloadMonthlyReport(data)
      if (!acknowledged.has(key)) {
        await updateSettings({ reportsAcknowledged: [...acknowledged, key] })
        await refresh()
      }
    } finally {
      setDownloadingKey(null)
    }
  }

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Rapoarte" />
        <EmptyState description="Rapoartele lunare apar aici automat, pe măsură ce imporți vânzări. Fiecare raport reproduce exact structura fișierului „Statistici vânzări PECO” — Rezumat, Top Produse, Top Produse fără carburanți/țigări, Evoluție Zilnică, Distribuție Orară." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Rapoarte"
        description="Un raport Excel per lună, identic ca structură cu „Statistici vânzări PECO” — 5 foi: Rezumat, Top Produse, Top Produse fără carburanți/țigări, Evoluție Zilnică, Distribuție Orară."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {months.map((m) => (
          <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{m.label}</p>
                <p className="text-xs text-slate-400">{formatNumber(m.rowCount)} linii importate</p>
              </div>
              {m.isCurrentMonth ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  în curs
                </span>
              ) : acknowledged.has(m.key) ? (
                <span className="rounded-full bg-good/10 px-2 py-0.5 text-[11px] font-medium text-good">
                  ridicat
                </span>
              ) : (
                <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">nou</span>
              )}
            </div>
            <button
              onClick={() => handleDownload(m.year, m.month, m.key)}
              disabled={downloadingKey === m.key}
              className="mt-3 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
            >
              {downloadingKey === m.key ? 'Se generează...' : 'Descarcă raportul (.xlsx)'}
            </button>
            {m.isCurrentMonth && (
              <p className="mt-1.5 text-[11px] text-slate-400">Luna e încă în desfășurare — raportul se recalculează cu datele de până azi.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
