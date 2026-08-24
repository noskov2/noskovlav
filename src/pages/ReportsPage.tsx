import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useDataStore } from '@/store/dataStore'
import { getMonthTargets, updateSettings } from '@/data/repo/settings'
import { listAvailableMonths } from '@/reports/reportAvailability'
import { computeMonthlyReportData } from '@/reports/monthlyReportData'
import { downloadMonthlyReport } from '@/reports/monthlyReportWorkbook'
import { computeDailyReceiptsData } from '@/reports/dailyReceiptsData'
import { downloadDailyReceiptsReport } from '@/reports/dailyReceiptsWorkbook'
import { computeProductAnalysisData } from '@/reports/productAnalysisData'
import { downloadProductAnalysisReport } from '@/reports/productAnalysisWorkbook'
import { computeExecutiveReportData } from '@/reports/executiveReportData'
import { downloadExecutiveReport } from '@/reports/executiveReportWorkbook'
import { formatNumber } from '@/lib/format'

type ReportStatus = 'disponibil' | 'generat' | 'verificat'

interface ReportCategory {
  slug: string
  title: string
  description: string
}

const CATEGORIES: ReportCategory[] = [
  { slug: 'executive', title: '1. Executive Monthly Report', description: 'Raportul lunar principal — cum a mers luna, ce probleme și oportunități au apărut.' },
  { slug: 'vanzari', title: '2. Vânzări', description: 'Statistici vânzări (5 foi) și Raport Bonuri, identice cu exporturile de referință ale stației.' },
  { slug: 'profitabilitate', title: '3. Profitabilitate', description: 'Marjă, profit brut, ABC/Pareto, matrice vânzări × marjă — pe categorii și produse.' },
  { slug: 'casieri', title: '4. Casieri & Echipe', description: 'Performanță pe casier/echipă, Score 0-100, comparații cu media stației și luna precedentă.' },
  { slug: 'cross-sell', title: '5. Cross-sell', description: 'Carburant + marfă, pe casier și echipă, cu drill-down până la bon.' },
  { slug: 'stoc', title: '6. Stoc', description: 'Stoc actual, Days of Stock, risc ruptură/suprastoc, capital blocat.' },
  { slug: 'furnizori', title: '7. Furnizori', description: 'Evoluția prețurilor, preț mediu ponderat, impact financiar al scumpirilor.' },
  { slug: 'produse', title: '8. Produse', description: 'Analiza produse pe echipe (cafea, dulciuri vitrină, sandwich-uri, promoții).' },
  { slug: 'promotii', title: '9. Promoții', description: 'Vânzări prin promoții, pe casier și echipă.' },
  { slug: 'data-quality', title: '10. Data Quality', description: 'Scorul de calitate a datelor și factorii care îl compun.' },
]

const LINK_CATEGORIES: Record<string, string> = {
  profitabilitate: '/profitabilitate',
  casieri: '/cross-sell',
  'cross-sell': '/cross-sell',
  stoc: '/stoc',
  furnizori: '/furnizori',
  promotii: '/cross-sell',
  'data-quality': '/calitate-date',
}

function statusOf(monthKey: string, slugs: string[], generated: Set<string>, verified: Set<string>): ReportStatus {
  const keys = slugs.map((s) => `${monthKey}:${s}`)
  if (keys.some((k) => verified.has(k))) return 'verificat'
  if (keys.some((k) => generated.has(k))) return 'generat'
  return 'disponibil'
}

const STATUS_LABEL: Record<ReportStatus, string> = { disponibil: 'Disponibil', generat: 'Generat', verificat: 'Verificat' }
const STATUS_TONE: Record<ReportStatus, 'neutral' | 'warn' | 'good'> = { disponibil: 'neutral', generat: 'warn', verificat: 'good' }

export function ReportsPage() {
  const { transactions, products, cashiers, teams, supplierReceipts, settings, refresh } = useDataStore()
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)

  const months = useMemo(() => listAvailableMonths(transactions), [transactions])
  const [monthKey, setMonthKey] = useState<string | null>(null)
  const selectedMonth = months.find((m) => m.key === monthKey) ?? months[0] ?? null

  const generated = new Set(settings?.reportsGenerated ?? [])
  const verified = new Set(settings?.reportsVerified ?? [])

  async function markGenerated(slug: string) {
    if (!selectedMonth) return
    const key = `${selectedMonth.key}:${slug}`
    const current = settings?.reportsGenerated ?? []
    if (current.includes(key)) return
    await updateSettings({ reportsGenerated: [...current, key], reportsAcknowledged: [...(settings?.reportsAcknowledged ?? []), selectedMonth.key] })
    await refresh()
  }

  async function toggleVerified(slug: string) {
    if (!selectedMonth) return
    const key = `${selectedMonth.key}:${slug}`
    const current = settings?.reportsVerified ?? []
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    await updateSettings({ reportsVerified: next })
    await refresh()
  }

  async function handleDownload(kind: 'statistici' | 'bonuri' | 'produse' | 'executive') {
    if (!selectedMonth) return
    const { year, month } = selectedMonth
    setDownloadingKey(kind)
    try {
      if (kind === 'statistici') {
        const data = computeMonthlyReportData(year, month, transactions, products)
        await downloadMonthlyReport(data)
        await markGenerated('vanzari')
      } else if (kind === 'bonuri') {
        const data = computeDailyReceiptsData(year, month, transactions, products)
        await downloadDailyReceiptsReport(data)
        await markGenerated('vanzari')
      } else if (kind === 'produse') {
        const data = computeProductAnalysisData(year, month, transactions, products, cashiers, teams)
        await downloadProductAnalysisReport(data)
        await markGenerated('produse')
      } else {
        const monthTargets = settings ? getMonthTargets(settings, selectedMonth.key) : null
        const data = computeExecutiveReportData(
          year,
          month,
          transactions,
          products,
          supplierReceipts,
          monthTargets?.station ?? null,
          monthTargets?.stationActual ?? null,
          settings?.defaultVatRatePct ?? 19,
        )
        await downloadExecutiveReport(data)
        await markGenerated('executive')
      }
    } finally {
      setDownloadingKey(null)
    }
  }

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Rapoarte" />
        <EmptyState description="Rapoartele lunare apar aici automat, pe măsură ce imporți vânzări." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Rapoarte"
        description="Cele 10 secțiuni de raportare ale stației, organizate pe lună — fiecare cu statusul ei: Disponibil, Generat sau Verificat."
      />

      <div className="mb-5 flex items-center gap-2">
        <span className="text-sm text-slate-500">Luna:</span>
        <select
          value={selectedMonth?.key ?? ''}
          onChange={(e) => setMonthKey(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label} ({formatNumber(m.rowCount)} linii){m.isCurrentMonth ? ' — în curs' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedMonth && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((cat) => {
            const isDownloadCard = cat.slug === 'executive' || cat.slug === 'vanzari' || cat.slug === 'produse'
            const status = statusOf(selectedMonth.key, [cat.slug], generated, verified)
            return (
              <div key={cat.slug} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{cat.title}</p>
                  <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                </div>
                <p className="mb-3 text-xs text-slate-500">{cat.description}</p>

                {cat.slug === 'executive' && (
                  <button
                    onClick={() => handleDownload('executive')}
                    disabled={downloadingKey === 'executive'}
                    className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
                  >
                    {downloadingKey === 'executive' ? 'Se generează...' : 'Descarcă Executive Report (.xlsx)'}
                  </button>
                )}

                {cat.slug === 'vanzari' && (
                  <div className="space-y-1.5">
                    <button
                      onClick={() => handleDownload('statistici')}
                      disabled={downloadingKey === 'statistici'}
                      className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
                    >
                      {downloadingKey === 'statistici' ? 'Se generează...' : 'Statistici Vânzări (.xlsx)'}
                    </button>
                    <button
                      onClick={() => handleDownload('bonuri')}
                      disabled={downloadingKey === 'bonuri'}
                      className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                    >
                      {downloadingKey === 'bonuri' ? 'Se generează...' : 'Raport Bonuri (.xlsx)'}
                    </button>
                  </div>
                )}

                {cat.slug === 'produse' && (
                  <button
                    onClick={() => handleDownload('produse')}
                    disabled={downloadingKey === 'produse'}
                    className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
                  >
                    {downloadingKey === 'produse' ? 'Se generează...' : 'Analiza Produse pe echipe (.xlsx)'}
                  </button>
                )}

                {LINK_CATEGORIES[cat.slug] && (
                  <Link
                    to={LINK_CATEGORIES[cat.slug]}
                    className="block w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm font-medium text-brand-700 hover:bg-brand-100"
                  >
                    Vezi pagina →
                  </Link>
                )}

                <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={status === 'verificat'}
                    disabled={isDownloadCard && status === 'disponibil'}
                    onChange={() => toggleVerified(cat.slug)}
                  />
                  Marchează ca verificat pentru {selectedMonth.label}
                </label>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
