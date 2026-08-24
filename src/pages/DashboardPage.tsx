import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { KpiCard } from '@/components/ui/KpiCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { DrillValue } from '@/components/ui/DrillValue'
import { TrendChart } from '@/components/charts/TrendChart'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { effectiveRange } from '@/kpi/filterState'
import { filterByDimensions, filterByRange } from '@/kpi/applyFilters'
import { computePeriodSummary } from '@/kpi/summary'
import { computeDailySeries } from '@/kpi/dailySeries'
import { computeInsights } from '@/kpi/insights'
import { addDays, dayCountInRange, monthLabel, todayStr } from '@/kpi/dateRanges'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { previousMonthRange, computeDelta } from '@/kpi/monthComparison'
import { computeFuelBreakdown, resolveFuelTypeIds, FUEL_TYPE_LABELS, type FuelTypeKey } from '@/kpi/fuelVariants'
import { computeCrossSellReport } from '@/kpi/crossSell'
import { computeTeamRollup } from '@/kpi/teamRollup'
import { computeForecast, computePace, type PaceStatus } from '@/kpi/forecast'
import { computeActionCenter, type ActionTone } from '@/kpi/actionCenter'
import { getMonthTargets } from '@/data/repo/settings'
import { useDrillFilterStore } from '@/store/drillFilterStore'
import { emptyMonthTargets } from '@/types/domain'
import { formatLei, formatNumber, formatPct, formatSignedLei } from '@/lib/format'
import { DeltaBadge } from '@/components/ui/DeltaBadge'

const TOP_GENERAL = '__general__'

const PACE_STATUS_LABEL: Record<PaceStatus, string> = {
  reached: 'Target deja atins',
  sufficient: 'Ritm suficient',
  marginal: 'Ritm la limită',
  insufficient: 'Ritm insuficient',
}
const PACE_STATUS_TONE: Record<PaceStatus, 'good' | 'warn' | 'bad'> = {
  reached: 'good',
  sufficient: 'good',
  marginal: 'warn',
  insufficient: 'bad',
}
const ACTION_TONE_CLASSES: Record<ActionTone, string> = {
  red: 'border-bad/20 bg-bad/5 text-bad',
  orange: 'border-warn/20 bg-warn/5 text-warn',
  green: 'border-good/20 bg-good/5 text-good',
}
const ACTION_TONE_ICON: Record<ActionTone, string> = { red: '🔴', orange: '🟠', green: '🟢' }

export function DashboardPage() {
  const { transactions, products, cashiers, teams, supplierReceipts, settings, productsById, cashiersById } =
    useDataStore()
  const { filter } = useFilterStore()
  const range = effectiveRange(filter)
  const [compare, setCompare] = useState(false)
  const defaultVatRatePct = settings?.defaultVatRatePct ?? 19
  const navigate = useNavigate()
  const setPendingDrillFilter = useDrillFilterStore((s) => s.setPending)

  const dimFiltered = useMemo(
    () => filterByDimensions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const periodTx = useMemo(() => filterByRange(dimFiltered, range.start, range.end), [dimFiltered, range])
  const summary = useMemo(
    () => computePeriodSummary(periodTx, products, defaultVatRatePct),
    [periodTx, products, defaultVatRatePct],
  )

  const prevRange = useMemo(() => previousMonthRange(range), [range])
  const prevTx = useMemo(() => filterByRange(dimFiltered, prevRange.start, prevRange.end), [dimFiltered, prevRange])
  const prevSummary = useMemo(
    () => computePeriodSummary(prevTx, products, defaultVatRatePct),
    [prevTx, products, defaultVatRatePct],
  )
  const trend = (key: keyof typeof summary) => {
    if (!compare) return undefined
    const d = computeDelta(summary[key] as number, prevSummary[key] as number)
    return d.pct == null ? undefined : { value: d.pct }
  }

  const insights = useMemo(
    () => computeInsights(range, dimFiltered, products, cashiers, supplierReceipts),
    [range, dimFiltered, products, cashiers, supplierReceipts],
  )

  const dailySeries = useMemo(() => computeDailySeries(periodTx, products, range), [periodTx, products, range])

  const fuelIds = useMemo(() => fuelProductIds(products), [products])
  const fuelTypeIds = useMemo(() => resolveFuelTypeIds(products), [products])
  const fuelBreakdown = useMemo(() => computeFuelBreakdown(periodTx, products), [periodTx, products])
  const prevFuelBreakdown = useMemo(() => computeFuelBreakdown(prevTx, products), [prevTx, products])
  const fuelTypeRows = (['motorina', 'benzina', 'gpl', 'altul'] as FuelTypeKey[]).filter(
    (k) => fuelBreakdown[k].quantity > 0 || fuelBreakdown[k].value > 0 || prevFuelBreakdown[k].value > 0,
  )
  const [topCategory, setTopCategory] = useState<string>(TOP_GENERAL)
  const topCategoryOptions = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  )
  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; category: string; qty: number; value: number }>()
    for (const t of periodTx) {
      const p = productsById.get(t.productId)
      const category = p?.category || t.categoryRaw
      if (topCategory === TOP_GENERAL) {
        if (fuelIds.has(t.productId)) continue // combustibilul are propriul panou mai jos — nu ocupă locurile din top general
      } else if (category !== topCategory) {
        continue
      }
      const acc = map.get(t.productId) ?? { name: p?.name ?? t.productRaw, category, qty: 0, value: 0 }
      acc.qty += t.quantity
      acc.value += t.value
      map.set(t.productId, acc)
    }
    return Array.from(map.entries())
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [periodTx, productsById, fuelIds, topCategory])

  const teamLeaderboard = useMemo(() => {
    const report = computeCrossSellReport(periodTx, products, cashiers)
    return computeTeamRollup(report.cashiers, teams).sort((a, b) => b.totalSales - a.totalSales)
  }, [periodTx, products, cashiers, teams])

  const coffeeIds = useMemo(() => productIdsInGroup(products, 'cafea'), [products])
  const sandwichIds = useMemo(() => productIdsInGroup(products, 'sandwich'), [products])
  const vitrinaIds = useMemo(() => productIdsInGroup(products, 'dulciuriVitrina'), [products])
  const lemonadeIds = useMemo(() => productIdsInGroup(products, 'limonadaCeai'), [products])
  const promoIds = useMemo(() => productIdsInGroup(products, 'promotii'), [products])
  const promoLines = useMemo(
    () => periodTx.filter((t) => !!t.promotionRaw || promoIds.has(t.productId)),
    [periodTx, promoIds],
  )
  const promoValue = useMemo(() => promoLines.reduce((s, t) => s + t.value, 0), [promoLines])

  // Targeturi: momentan sunt configurate per lună calendaristică, la nivel de
  // stație — vezi pagina Targeturi. Folosim aceeași lună (curentă) atât pentru
  // comparațiile din KPI-urile principale, cât și pentru panoul Forecast/Ritm,
  // indiferent de filtrul de perioadă activ pe Dashboard.
  const currentMonthKey = todayStr().slice(0, 7)
  const monthTargets = useMemo(
    () => (settings ? getMonthTargets(settings, currentMonthKey) : emptyMonthTargets()),
    [settings, currentMonthKey],
  )
  const stationTarget = monthTargets.station
  const stationActual = monthTargets.stationActual

  const monthRange = useMemo(() => ({ start: `${currentMonthKey}-01`, end: todayStr() }), [currentMonthKey])
  const monthTx = useMemo(() => filterByRange(dimFiltered, monthRange.start, monthRange.end), [dimFiltered, monthRange])
  const monthSummary = useMemo(
    () => computePeriodSummary(monthTx, products, defaultVatRatePct),
    [monthTx, products, defaultVatRatePct],
  )
  // Targetul de vânzări e definit ca marfă + GPL, EXCLUZÂND motorină și
  // benzină (acelea au propriile ritmuri de vânzare, mult mai mari, și nu
  // fac parte din ce trebuie să "facă" echipa) — vezi și pagina Target.
  // Comparăm deci targetul cu aceeași bază, nu cu vânzările totale ale
  // stației (care ar include motorină+benzină și ar face targetul să pară
  // "deja atins" din prima săptămână, indiferent de ritmul real la marfă+GPL).
  const monthFuelBreakdown = useMemo(() => computeFuelBreakdown(monthTx, products), [monthTx, products])
  const transactionsBasedActual = monthSummary.totalSales - monthFuelBreakdown.motorina.value - monthFuelBreakdown.benzina.value
  // Preferă "Realizat până acum" sincronizat din pagina Target (calculat din
  // Excel-ul de target al echipei) în locul celui calculat aici din
  // tranzacțiile importate — sunt două surse de date diferite, iar dacă un
  // import e incomplet, cifra calculată din tranzacții rămâne în urmă și nu
  // mai bate cu ce arată pagina Target, în care managerul are mai multă
  // încredere. Cade pe varianta din tranzacții doar dacă nu s-a încărcat
  // încă niciun fișier de target.
  const targetRelevantActual = stationActual?.realizat ?? transactionsBasedActual
  const actualSource = stationActual?.realizat != null ? 'target' : 'transactions'
  const operationalDaysSoFar = useMemo(() => new Set(monthTx.map((t) => t.date)).size, [monthTx])
  const daysInCurrentMonth = useMemo(() => {
    const [y, m] = currentMonthKey.split('-').map(Number)
    return new Date(y, m, 0).getDate()
  }, [currentMonthKey])
  const daysElapsedInMonth = new Date(`${todayStr()}T00:00:00`).getDate()

  const recentRange = useMemo(() => ({ start: addDays(todayStr(), -6), end: todayStr() }), [])
  const recentTx = useMemo(() => filterByRange(dimFiltered, recentRange.start, recentRange.end), [dimFiltered, recentRange])
  const recentFuelBreakdown = useMemo(() => computeFuelBreakdown(recentTx, products), [recentTx, products])
  const recentAvgPerDay = useMemo(() => {
    const recentTargetRelevant =
      recentTx.reduce((s, t) => s + t.value, 0) - recentFuelBreakdown.motorina.value - recentFuelBreakdown.benzina.value
    return recentTargetRelevant / dayCountInRange(recentRange)
  }, [recentTx, recentFuelBreakdown, recentRange])

  const salesForecast = useMemo(
    () =>
      computeForecast(
        targetRelevantActual,
        operationalDaysSoFar,
        daysElapsedInMonth,
        daysInCurrentMonth,
        stationTarget.totalSales,
      ),
    [targetRelevantActual, operationalDaysSoFar, daysElapsedInMonth, daysInCurrentMonth, stationTarget.totalSales],
  )
  const salesPace = useMemo(
    () =>
      stationTarget.totalSales != null
        ? computePace(targetRelevantActual, stationTarget.totalSales, salesForecast.daysRemainingInMonth, recentAvgPerDay)
        : null,
    [targetRelevantActual, stationTarget.totalSales, salesForecast.daysRemainingInMonth, recentAvgPerDay],
  )

  const actionItems = useMemo(
    () => computeActionCenter(range, transactions, products, supplierReceipts, stationTarget, summary.crossSellPct, defaultVatRatePct),
    [range, transactions, products, supplierReceipts, stationTarget, summary.crossSellPct, defaultVatRatePct],
  )

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Rezumatul stației" />
        <EmptyState />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Rezumat pentru perioada selectată" />
      <div className="mb-5">
        <FilterBar />
      </div>

      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        Compară cu luna anterioară
        {compare && (
          <span className="text-xs text-slate-400">
            ({prevRange.start} – {prevRange.end})
          </span>
        )}
      </label>

      {insights.length > 0 && (
        <div className="mb-5 grid gap-2 sm:grid-cols-2">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                insight.tone === 'good'
                  ? 'border-good/20 bg-good/5 text-good'
                  : insight.tone === 'bad'
                    ? 'border-bad/20 bg-bad/5 text-bad'
                    : insight.tone === 'warn'
                      ? 'border-warn/20 bg-warn/5 text-warn'
                      : 'border-brand-200 bg-brand-50 text-brand-700'
              }`}
            >
              <span>💡</span>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Necesită atenție</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {actionItems.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (item.productIds) setPendingDrillFilter(item.link, item.productIds)
                  navigate(item.link)
                }}
                className={clsx(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition hover:opacity-80',
                  ACTION_TONE_CLASSES[item.tone],
                )}
              >
                <span>{ACTION_TONE_ICON[item.tone]}</span>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold text-slate-700">Indicatori principali</h3>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
          <p
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
            title="Suma valorii tuturor liniilor de tranzacție din perioada selectată."
          >
            Vânzări totale
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-slate-900">
            <DrillValue title="Vânzări totale" lines={periodTx}>
              {formatLei(summary.totalSales)}
            </DrillValue>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {compare && <DeltaBadge delta={computeDelta(summary.totalSales, prevSummary.totalSales)} />}
          </div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
          <p
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
            title="Profit brut = Vânzări fără TVA − Cost (pe partea cu cost cunoscut). Marjă % = Profit brut / Vânzări totale. Coverage = % din vânzări cu cost de achiziție cunoscut."
          >
            Profit brut
          </p>
          <p
            className={clsx(
              'mt-1.5 text-3xl font-bold tabular-nums',
              summary.grossProfitEstimate >= 0 ? 'text-good' : 'text-bad',
            )}
          >
            {formatLei(summary.grossProfitEstimate)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Marjă: {summary.totalSales > 0 ? formatPct((summary.grossProfitEstimate / summary.totalSales) * 100) : '—'}</span>
            <span>Coverage: {formatPct(summary.grossProfitKnownShare * 100, 0)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
          <p
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
            title="Cross-sell % = (bonuri cu carburant + minimum un produs eligibil de marfă) / (toate bonurile cu carburant) × 100. Exclude SGR, discounturi, taxe și alte linii tehnice."
          >
            Cross-sell
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-slate-900">{formatPct(summary.crossSellPct)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Target: {stationTarget.crossSellPct != null ? formatPct(stationTarget.crossSellPct) : '—'}</span>
            {stationTarget.crossSellPct != null && (
              <span className={summary.crossSellPct >= stationTarget.crossSellPct ? 'text-good' : 'text-bad'}>
                {(summary.crossSellPct - stationTarget.crossSellPct) >= 0 ? '+' : ''}
                {(summary.crossSellPct - stationTarget.crossSellPct).toFixed(1)} pp
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-brand-200 bg-white p-4 shadow-sm">
          <p
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
            title="Bon mediu = Vânzări totale / Numărul de bonuri (grupate după dată + bon + casier)."
          >
            Bon mediu
          </p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-slate-900">{formatLei(summary.avgReceiptValue)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {compare ? (
              <DeltaBadge delta={computeDelta(summary.avgReceiptValue, prevSummary.avgReceiptValue)} />
            ) : (
              <span>{formatNumber(summary.receiptCount)} bonuri</span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">
          Forecast &amp; ritm către target — {monthLabel(`${currentMonthKey}-01`)}
        </h3>
        <p className="mb-3 text-xs text-slate-400">Target pe marfă + GPL — motorina și benzina nu intră în calcul.</p>
        {stationTarget.totalSales == null ? (
          <p className="text-sm text-slate-400">
            Nu ai configurat un target de vânzări totale pentru luna curentă.{' '}
            <Link to="/targeturi" className="text-brand-600 hover:underline">
              Configurează-l în pagina Target
            </Link>{' '}
            pentru a vedea estimarea de sfârșit de lună și ritmul necesar.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="text-sm text-slate-600">
              <p>
                Target: <span className="font-medium text-slate-900">{formatLei(salesForecast.target ?? 0)}</span> · Actual:{' '}
                <span className="font-medium text-slate-900">{formatLei(salesForecast.actual)}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {actualSource === 'target'
                  ? 'Actual = „Realizat până acum" din pagina Target (sincronizat din Excel-ul încărcat acolo).'
                  : 'Actual calculat din vânzările importate — încarcă un fișier pe pagina Target pentru o cifră mai exactă.'}
              </p>
              <p className="mt-1">
                Forecast (estimare sfârșit de lună):{' '}
                <span className="font-medium text-slate-900">{formatLei(salesForecast.forecast)}</span>
              </p>
              {salesForecast.gap != null && (
                <p className={clsx('mt-1 font-medium', salesForecast.gap >= 0 ? 'text-good' : 'text-bad')}>
                  Gap estimat: {formatSignedLei(salesForecast.gap)}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                {salesForecast.operationalDaysSoFar} zile cu vânzări în luna curentă · medie{' '}
                {formatLei(salesForecast.avgPerOperationalDay)}/zi operațională
              </p>
            </div>
            {salesPace && (
              <div className="text-sm text-slate-600">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                      PACE_STATUS_TONE[salesPace.status] === 'good'
                        ? 'bg-good/10 text-good'
                        : PACE_STATUS_TONE[salesPace.status] === 'warn'
                          ? 'bg-warn/10 text-warn'
                          : 'bg-bad/10 text-bad',
                    )}
                  >
                    {PACE_STATUS_LABEL[salesPace.status]}
                  </span>
                </div>
                {salesPace.status === 'reached' ? (
                  <p>Targetul lunii a fost deja atins.</p>
                ) : (
                  <>
                    <p>
                      Mai sunt necesari <span className="font-medium text-slate-900">{formatLei(salesPace.remaining)}</span> în{' '}
                      {salesPace.daysRemaining} zile.
                    </p>
                    <p className="mt-1">
                      Necesar: <span className="font-medium text-slate-900">{formatLei(salesPace.neededPerDay)}</span>/zi. Media
                      ultimelor 7 zile: <span className="font-medium text-slate-900">{formatLei(salesPace.recentAvgPerDay)}</span>/zi.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <h3 className="mb-3 text-sm font-semibold text-slate-700">Alți indicatori</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Marfă"
          value={
            <DrillValue title="Vânzări marfă" lines={periodTx.filter((t) => !fuelIds.has(t.productId))}>
              {formatLei(summary.goodsSales)}
            </DrillValue>
          }
          trend={trend('goodsSales')}
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Combustibil</p>
          <div className="space-y-1">
            {(['motorina', 'benzina', 'gpl'] as FuelTypeKey[]).map((key) => (
              <div key={key} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">{FUEL_TYPE_LABELS[key]}</span>
                <DrillValue
                  title={`${FUEL_TYPE_LABELS[key]} — vânzări`}
                  lines={periodTx.filter((t) => fuelTypeIds[key].has(t.productId))}
                  className="text-right font-medium text-slate-800"
                >
                  {formatNumber(fuelBreakdown[key].quantity, 0)} L · {formatLei(fuelBreakdown[key].value)}
                </DrillValue>
              </div>
            ))}
          </div>
        </div>
        <KpiCard label="Bonuri" value={formatNumber(summary.receiptCount)} trend={trend('receiptCount')} />
        <KpiCard
          label="Cafele"
          value={
            <DrillValue title="Cafele vândute" lines={periodTx.filter((t) => coffeeIds.has(t.productId))}>
              {formatNumber(summary.coffeeCount)}
            </DrillValue>
          }
          trend={trend('coffeeCount')}
        />
        <KpiCard
          label="Sandwich-uri"
          value={
            <DrillValue title="Sandwich-uri vândute" lines={periodTx.filter((t) => sandwichIds.has(t.productId))}>
              {formatNumber(summary.sandwichCount)}
            </DrillValue>
          }
          trend={trend('sandwichCount')}
        />
        <KpiCard
          label="Dulciuri vitrină"
          value={
            <DrillValue title="Dulciuri vitrină vândute" lines={periodTx.filter((t) => vitrinaIds.has(t.productId))}>
              {formatNumber(summary.vitrinaCount)}
            </DrillValue>
          }
          trend={trend('vitrinaCount')}
        />
        <KpiCard
          label="Limonade/ceai"
          value={
            <DrillValue title="Limonade/ceaiuri vândute" lines={periodTx.filter((t) => lemonadeIds.has(t.productId))}>
              {formatNumber(summary.lemonadeCount)}
            </DrillValue>
          }
          trend={trend('lemonadeCount')}
        />
        <KpiCard
          label="Promoții"
          value={
            <DrillValue title="Vânzări prin promoții" lines={promoLines}>
              {formatLei(promoValue)}
            </DrillValue>
          }
          hint={`${formatNumber(promoLines.length)} linii`}
        />
      </div>

      {fuelTypeRows.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Combustibil pe tip</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1.5">Tip</th>
                  <th className="px-2 py-1.5 text-right">Cantitate</th>
                  {compare && <th className="px-2 py-1.5 text-right">vs. luna anterioară</th>}
                  <th className="px-2 py-1.5 text-right">Valoare</th>
                  {compare && <th className="px-2 py-1.5 text-right">vs. luna anterioară</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fuelTypeRows.map((key) => (
                  <tr key={key}>
                    <td className="px-2 py-1.5 font-medium text-slate-800">{FUEL_TYPE_LABELS[key]}</td>
                    <td className="px-2 py-1.5 text-right">
                      <DrillValue
                        title={`${FUEL_TYPE_LABELS[key]} — cantitate`}
                        lines={periodTx.filter((t) => fuelTypeIds[key].has(t.productId))}
                      >
                        {formatNumber(fuelBreakdown[key].quantity, 0)} L
                      </DrillValue>
                    </td>
                    {compare && (
                      <td className="px-2 py-1.5 text-right">
                        <DeltaBadge delta={computeDelta(fuelBreakdown[key].quantity, prevFuelBreakdown[key].quantity)} />
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right">
                      <DrillValue
                        title={`${FUEL_TYPE_LABELS[key]} — valoare`}
                        lines={periodTx.filter((t) => fuelTypeIds[key].has(t.productId))}
                      >
                        {formatLei(fuelBreakdown[key].value)}
                      </DrillValue>
                    </td>
                    {compare && (
                      <td className="px-2 py-1.5 text-right">
                        <DeltaBadge delta={computeDelta(fuelBreakdown[key].value, prevFuelBreakdown[key].value)} />
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="font-semibold text-slate-900">
                  <td className="px-2 py-1.5">TOTAL</td>
                  <td className="px-2 py-1.5 text-right">{formatNumber(fuelBreakdown.total.quantity, 0)} L</td>
                  {compare && (
                    <td className="px-2 py-1.5 text-right">
                      <DeltaBadge delta={computeDelta(fuelBreakdown.total.quantity, prevFuelBreakdown.total.quantity)} />
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right">{formatLei(fuelBreakdown.total.value)}</td>
                  {compare && (
                    <td className="px-2 py-1.5 text-right">
                      <DeltaBadge delta={computeDelta(fuelBreakdown.total.value, prevFuelBreakdown.total.value)} />
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
          {fuelTypeRows.includes('altul') && (
            <p className="mt-2 text-xs text-slate-400">
              „Alt combustibil" = produse din grupul Carburant al căror nume nu conține motorină/benzină/GPL — verifică-le în Nomenclator dacă vrei să le reclasifici.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">Top 10 produse</h3>
            <select
              value={topCategory}
              onChange={(e) => setTopCategory(e.target.value)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            >
              <option value={TOP_GENERAL}>General (fără motorină, benzină, GPL)</option>
              {topCategoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-400">Nicio vânzare în perioada selectată.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-slate-400">{i + 1}.</span>
                    <DrillValue
                      title={p.name}
                      lines={periodTx.filter((t) => t.productId === p.productId)}
                      className="min-w-0 truncate rounded text-left text-slate-700 underline decoration-dotted decoration-slate-300 underline-offset-2 transition hover:text-brand-600 hover:decoration-brand-400"
                    >
                      {p.name}
                    </DrillValue>
                  </span>
                  <span className="shrink-0 text-right text-slate-500">
                    {formatNumber(p.qty, 2)} buc · <span className="font-medium text-slate-800">{formatLei(p.value)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Clasament echipe</h3>
          {teamLeaderboard.length === 0 ? (
            <p className="text-sm text-slate-400">Nicio echipă configurată — vezi Nomenclator → Casieri.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {teamLeaderboard.map((row, i) => (
                <li key={row.cashier.id} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 hover:bg-slate-50">
                  <span className="flex items-center gap-2">
                    <span className="w-4 shrink-0 text-slate-400">{i + 1}.</span>
                    <span className="text-slate-700">{row.cashier.name}</span>
                  </span>
                  <span className="text-right text-slate-500">
                    {formatNumber(row.totalReceipts)} bonuri · <span className="font-medium text-slate-800">{formatLei(row.totalSales)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Evoluția vânzărilor totale</h3>
        <TrendChart data={dailySeries.map((p) => ({ date: p.date, value: p.summary.totalSales }))} />
      </div>
    </div>
  )
}
