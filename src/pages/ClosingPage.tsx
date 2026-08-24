import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDataStore } from '@/store/dataStore'
import { getMonthTargets } from '@/data/repo/settings'
import { saveMonthSnapshot, deleteMonthSnapshot } from '@/data/repo/monthSnapshots'
import { listAvailableMonths } from '@/reports/reportAvailability'
import { computePeriodSummary } from '@/kpi/summary'
import { computeProductProfitability } from '@/kpi/profitability'
import { computeDataQualityReport } from '@/kpi/dataQuality'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import type { MonthSnapshot } from '@/types/domain'

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

interface ChecklistItem {
  label: string
  ok: boolean
  detail: string
}

export function ClosingPage() {
  const {
    transactions,
    products,
    cashiers,
    importBatches,
    supplierReceipts,
    stockSnapshots,
    settings,
    monthSnapshots,
    refresh,
  } = useDataStore()

  const months = useMemo(() => listAvailableMonths(transactions), [transactions])
  const [monthKey, setMonthKey] = useState<string | null>(null)
  const selectedMonth = months.find((m) => m.key === monthKey) ?? months[0] ?? null

  const [closing, setClosing] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)

  const existingSnapshot: MonthSnapshot | undefined = selectedMonth
    ? monthSnapshots.find((s) => s.monthKey === selectedMonth.key)
    : undefined

  const monthRange = useMemo(
    () =>
      selectedMonth
        ? { start: `${selectedMonth.key}-01`, end: `${selectedMonth.key}-${String(daysInMonth(selectedMonth.year, selectedMonth.month)).padStart(2, '0')}` }
        : null,
    [selectedMonth],
  )
  const monthTx = useMemo(
    () => (monthRange ? transactions.filter((t) => t.date >= monthRange.start && t.date <= monthRange.end) : []),
    [transactions, monthRange],
  )

  const checklist: ChecklistItem[] = useMemo(() => {
    if (!selectedMonth || !monthRange) return []
    const items: ChecklistItem[] = []

    items.push({
      label: 'Vânzări importate',
      ok: monthTx.length > 0,
      detail: `${formatNumber(monthTx.length)} linii de tranzacții în ${selectedMonth.label}.`,
    })

    const withReceipt = monthTx.filter((t) => t.hasReceiptNo).length
    const receiptPct = monthTx.length > 0 ? (withReceipt / monthTx.length) * 100 : 0
    items.push({
      label: 'Bonuri valide',
      ok: monthTx.length === 0 || receiptPct >= 95,
      detail: `${formatPct(receiptPct, 1)} din linii au un număr de bon real (nu sintetic).`,
    })

    const monthBatches = importBatches.filter(
      (b) => b.kind === 'sales' && b.dateMin != null && b.dateMax != null && b.dateMin <= monthRange.end && b.dateMax >= monthRange.start,
    )
    const dupCount = monthBatches.reduce((s, b) => s + b.duplicateRowCount, 0)
    items.push({
      label: 'Duplicate verificate',
      ok: true,
      detail: dupCount > 0 ? `${formatNumber(dupCount)} rânduri duplicate au fost detectate și excluse automat la import.` : 'Niciun duplicat detectat la import.',
    })

    items.push({
      label: 'Achiziții importate',
      ok: supplierReceipts.length > 0,
      detail: supplierReceipts.length > 0 ? `${formatNumber(supplierReceipts.length)} recepții în istoric (folosite pentru cost).` : 'Niciun import de achiziții încă — profitul nu poate fi calculat.',
    })

    const monthEndTs = new Date(`${monthRange.end}T23:59:59`).getTime()
    const hasFinalStock = stockSnapshots.some((s) => s.asOf >= monthEndTs - 86400000 * 5)
    items.push({
      label: 'Stoc final importat',
      ok: hasFinalStock,
      detail: hasFinalStock ? 'Există un instantaneu de stoc din apropierea sfârșitului lunii.' : 'Nu există un instantaneu de stoc recent — importă stocul curent din Import date.',
    })

    const activeProducts = products.filter((p) => p.active)
    const categorized = activeProducts.filter((p) => !!p.category).length
    const catPct = activeProducts.length > 0 ? (categorized / activeProducts.length) * 100 : 0
    items.push({
      label: 'Produse clasificate',
      ok: activeProducts.length === 0 || catPct >= 90,
      detail: `${formatPct(catPct, 1)} din produsele active au o categorie setată.`,
    })

    const productRows = computeProductProfitability(monthTx, products, supplierReceipts, settings?.defaultVatRatePct ?? 19)
    const totalQty = productRows.reduce((s, r) => s + r.quantity, 0)
    const coveredQty = productRows.reduce((s, r) => s + r.quantity * r.costCoverage, 0)
    const costCoveragePct = totalQty > 0 ? (coveredQty / totalQty) * 100 : 0
    items.push({
      label: 'Coverage cost suficient',
      ok: totalQty === 0 || costCoveragePct >= 90,
      detail: `${formatPct(costCoveragePct, 1)} din cantitatea vândută are un cost de achiziție cunoscut.`,
    })

    const dq = computeDataQualityReport(transactions, products, cashiers, importBatches, supplierReceipts)
    items.push({
      label: 'Data Quality verificat',
      ok: dq.score >= 75,
      detail: `Scor global de calitate a datelor: ${formatNumber(dq.score)}/100.`,
    })

    const generated = new Set(settings?.reportsGenerated ?? [])
    const reportsOk = generated.has(`${selectedMonth.key}:executive`) || generated.has(`${selectedMonth.key}:vanzari`)
    items.push({
      label: 'Rapoarte generate',
      ok: reportsOk,
      detail: reportsOk ? 'Cel puțin un raport lunar a fost descărcat pentru această lună.' : 'Niciun raport descărcat încă — vezi pagina Rapoarte.',
    })

    return items
  }, [selectedMonth, monthRange, monthTx, importBatches, supplierReceipts, stockSnapshots, products, cashiers, transactions, settings])

  async function closeMonth() {
    if (!selectedMonth) return
    setClosing(true)
    try {
      const summary = computePeriodSummary(monthTx, products, settings?.defaultVatRatePct ?? 19)
      const dq = computeDataQualityReport(transactions, products, cashiers, importBatches, supplierReceipts)
      const target = settings ? getMonthTargets(settings, selectedMonth.key).station : null
      const snapshot: MonthSnapshot = {
        id: selectedMonth.key,
        monthKey: selectedMonth.key,
        closedAt: Date.now(),
        totalSales: summary.totalSales,
        goodsSales: summary.goodsSales,
        fuelSales: summary.fuelSales,
        grossProfitEstimate: summary.grossProfitEstimate,
        // Marja folosește vânzările fără TVA ale feliei cu cost cunoscut
        // (salesNoVatKnown), nu totalSales (cu TVA inclus) — TVA-ul colectat
        // nu e profit.
        marginPct: summary.salesNoVatKnown > 0 ? (summary.grossProfitEstimate / summary.salesNoVatKnown) * 100 : null,
        receiptCount: summary.receiptCount,
        avgReceiptValue: summary.avgReceiptValue,
        totalLiters: summary.totalLiters,
        crossSellPct: summary.crossSellPct,
        coffeeCount: summary.coffeeCount,
        sandwichCount: summary.sandwichCount,
        target,
        dataQualityScore: dq.score,
      }
      await saveMonthSnapshot(snapshot)
      await refresh()
    } finally {
      setClosing(false)
    }
  }

  async function reopenMonth() {
    if (!selectedMonth) return
    await deleteMonthSnapshot(selectedMonth.key)
    setConfirmReopen(false)
    await refresh()
  }

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Închidere lună" />
        <EmptyState />
      </div>
    )
  }

  const allOk = checklist.every((c) => c.ok)

  return (
    <div>
      <PageHeader
        title="Închidere lună"
        description="Verifică checklist-ul și salvează un instantaneu imuabil al KPI-urilor principale — cifrele închise nu se mai schimbă, indiferent de modificări ulterioare în Nomenclator."
      />

      <div className="mb-5 flex items-center gap-2">
        <span className="text-sm text-slate-500">Luna:</span>
        <select
          value={selectedMonth?.key ?? ''}
          onChange={(e) => {
            setMonthKey(e.target.value)
            setConfirmReopen(false)
          }}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
              {monthSnapshots.some((s) => s.monthKey === m.key) ? ' — închisă' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedMonth && existingSnapshot && (
        <div className="mb-5 rounded-xl border border-good/30 bg-good/5 p-4">
          <p className="mb-3 text-sm font-semibold text-good">
            Lună închisă la {new Date(existingSnapshot.closedAt).toLocaleString('ro-RO')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SnapshotStat label="Vânzări totale" value={formatLei(existingSnapshot.totalSales)} />
            <SnapshotStat label="Profit brut estimat" value={formatLei(existingSnapshot.grossProfitEstimate)} />
            <SnapshotStat label="Marjă" value={existingSnapshot.marginPct != null ? formatPct(existingSnapshot.marginPct) : '—'} />
            <SnapshotStat label="Bonuri" value={formatNumber(existingSnapshot.receiptCount)} />
            <SnapshotStat label="Bon mediu" value={formatLei(existingSnapshot.avgReceiptValue)} />
            <SnapshotStat label="Litri" value={`${formatNumber(existingSnapshot.totalLiters, 0)} L`} />
            <SnapshotStat label="Cross-sell" value={formatPct(existingSnapshot.crossSellPct)} />
            <SnapshotStat label="Data Quality" value={`${formatNumber(existingSnapshot.dataQualityScore)}/100`} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Acesta este instantaneul permanent al lunii — paginile live pot arăta cifre ușor diferite dacă ai corectat
            date ulterior (ex. o categorie greșită), dar acest raport rămâne fix.
          </p>
          <div className="mt-3">
            {!confirmReopen ? (
              <button
                onClick={() => setConfirmReopen(true)}
                className="rounded-lg border border-bad/40 px-3 py-1.5 text-xs font-medium text-bad hover:bg-bad/10"
              >
                Redeschide luna
              </button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="text-xs text-slate-500">Sigur? Instantaneul salvat va fi șters.</span>
                <button onClick={reopenMonth} className="rounded-lg bg-bad px-3 py-1.5 text-xs font-medium text-white">
                  Da, redeschide
                </button>
                <button
                  onClick={() => setConfirmReopen(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
                >
                  Anulează
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {selectedMonth && !existingSnapshot && (
        <>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Checklist — {selectedMonth.label}</h3>
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span className={item.ok ? 'text-good' : 'text-warn'}>{item.ok ? '✓' : '⚠'}</span>
                  <span>
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <span className="ml-1.5 text-slate-500">— {item.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!allOk && (
              <p className="mt-3 text-xs text-warn">
                Unele verificări nu sunt încă îndeplinite — poți închide luna oricum, dar verifică mai întâi punctele
                marcate cu ⚠.
              </p>
            )}
          </div>

          <button
            onClick={closeMonth}
            disabled={closing}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
          >
            {closing ? 'Se închide...' : `Închide luna ${selectedMonth.label}`}
          </button>
        </>
      )}
    </div>
  )
}

function SnapshotStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900">{value}</p>
    </div>
  )
}
