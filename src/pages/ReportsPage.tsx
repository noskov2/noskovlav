import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDataStore } from '@/store/dataStore'
import { updateSettings } from '@/data/repo/settings'
import { listAvailableMonths } from '@/reports/reportAvailability'
import { computeMonthlyReportData } from '@/reports/monthlyReportData'
import { downloadMonthlyReport } from '@/reports/monthlyReportWorkbook'
import { computeDailyReceiptsData } from '@/reports/dailyReceiptsData'
import { downloadDailyReceiptsReport } from '@/reports/dailyReceiptsWorkbook'
import { computeProductAnalysisData } from '@/reports/productAnalysisData'
import { downloadProductAnalysisReport } from '@/reports/productAnalysisWorkbook'
import { formatNumber } from '@/lib/format'

type ReportKind = 'monthly' | 'bonuri' | 'produse'

export function ReportsPage() {
  const { transactions, products, cashiers, teams, settings, refresh } = useDataStore()
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)

  const months = useMemo(() => listAvailableMonths(transactions), [transactions])
  const acknowledged = new Set(settings?.reportsAcknowledged ?? [])

  async function handleDownload(year: number, month: number, key: string, kind: ReportKind) {
    const dlKey = `${key}:${kind}`
    setDownloadingKey(dlKey)
    try {
      if (kind === 'monthly') {
        const data = computeMonthlyReportData(year, month, transactions, products)
        await downloadMonthlyReport(data)
      } else if (kind === 'bonuri') {
        const data = computeDailyReceiptsData(year, month, transactions, products)
        await downloadDailyReceiptsReport(data)
      } else {
        const data = computeProductAnalysisData(year, month, transactions, products, cashiers, teams)
        await downloadProductAnalysisReport(data)
      }
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
        <EmptyState description="Rapoartele lunare apar aici automat, pe măsură ce imporți vânzări: Statistici vânzări, Raport Bonuri și Analiza Produse pe echipe." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Rapoarte"
        description="Trei rapoarte Excel per lună: Statistici Vânzări (5 foi, identic cu „Statistici vânzări PECO”), Raport Bonuri (identic cu „Raport bonuri”) și Analiza Produse pe echipe (cafea, dulciuri vitrină, sandwich-uri, promoții — cu îmbunătățiri față de fișierul de referință)."
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
            <div className="mt-3 space-y-1.5">
              <button
                onClick={() => handleDownload(m.year, m.month, m.key, 'monthly')}
                disabled={downloadingKey === `${m.key}:monthly`}
                className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
              >
                {downloadingKey === `${m.key}:monthly` ? 'Se generează...' : 'Statistici Vânzări (.xlsx)'}
              </button>
              <button
                onClick={() => handleDownload(m.year, m.month, m.key, 'bonuri')}
                disabled={downloadingKey === `${m.key}:bonuri`}
                className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                {downloadingKey === `${m.key}:bonuri` ? 'Se generează...' : 'Raport Bonuri (.xlsx)'}
              </button>
              <button
                onClick={() => handleDownload(m.year, m.month, m.key, 'produse')}
                disabled={downloadingKey === `${m.key}:produse`}
                className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                {downloadingKey === `${m.key}:produse` ? 'Se generează...' : 'Analiza Produse pe echipe (.xlsx)'}
              </button>
            </div>
            {m.isCurrentMonth && (
              <p className="mt-1.5 text-[11px] text-slate-400">Luna e încă în desfășurare — rapoartele se recalculează cu datele de până azi.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
