import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { computeSlowMovers, noSaleSinceDays } from '@/kpi/slowMovers'
import { computeProductPriceSummaries } from '@/kpi/suppliers'
import { addDays } from '@/kpi/dateRanges'
import { productIdsInGroup } from '@/kpi/productGroups'
import { previousMonthRange, computeDelta } from '@/kpi/monthComparison'
import { computeFuelBreakdown, resolveFuelTypeIds, FUEL_TYPE_LABELS, type FuelTypeKey } from '@/kpi/fuelVariants'
import { computeCrossSellReport } from '@/kpi/crossSell'
import { computeTeamRollup } from '@/kpi/teamRollup'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { DeltaBadge } from '@/components/ui/DeltaBadge'

const TOP_GENERAL = '__general__'

export function DashboardPage() {
  const { transactions, products, cashiers, teams, supplierReceipts, productsById, cashiersById } = useDataStore()
  const { filter } = useFilterStore()
  const range = effectiveRange(filter)
  const [compare, setCompare] = useState(false)

  const dimFiltered = useMemo(
    () => filterByDimensions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const periodTx = useMemo(() => filterByRange(dimFiltered, range.start, range.end), [dimFiltered, range])
  const summary = useMemo(() => computePeriodSummary(periodTx, products), [periodTx, products])

  const prevRange = useMemo(() => previousMonthRange(range), [range])
  const prevTx = useMemo(() => filterByRange(dimFiltered, prevRange.start, prevRange.end), [dimFiltered, prevRange])
  const prevSummary = useMemo(() => computePeriodSummary(prevTx, products), [prevTx, products])
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

  const slowRows = useMemo(() => computeSlowMovers(transactions, products, range), [transactions, products, range])
  const noSale30 = useMemo(() => noSaleSinceDays(slowRows, range.end, 30), [slowRows, range])

  const recentReceipts = useMemo(
    () => supplierReceipts.filter((r) => r.date >= addDays(range.end, -60)),
    [supplierReceipts, range],
  )
  const priceHikes = useMemo(
    () => computeProductPriceSummaries(recentReceipts, products).filter((s) => (s.diffPct ?? 0) > 5),
    [recentReceipts, products],
  )

  const fuelIds = useMemo(() => productIdsInGroup(products, 'carburant'), [products])
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <KpiCard
          label="Vânzări totale"
          value={
            <DrillValue title="Vânzări totale" lines={periodTx}>
              {formatLei(summary.totalSales)}
            </DrillValue>
          }
          trend={trend('totalSales')}
        />
        <KpiCard
          label="Marfă"
          value={
            <DrillValue title="Vânzări marfă" lines={periodTx.filter((t) => !fuelIds.has(t.productId))}>
              {formatLei(summary.goodsSales)}
            </DrillValue>
          }
          trend={trend('goodsSales')}
        />
        <KpiCard
          label="Carburant"
          value={
            <DrillValue title="Vânzări carburant" lines={periodTx.filter((t) => fuelIds.has(t.productId))}>
              {formatLei(summary.fuelSales)}
            </DrillValue>
          }
          hint={`${formatNumber(summary.fuelLiters, 0)} litri${summary.gplLiters > 0 ? ` · GPL ${formatNumber(summary.gplLiters, 0)} L` : ''}`}
          trend={trend('fuelSales')}
        />
        <KpiCard label="Bonuri" value={formatNumber(summary.receiptCount)} trend={trend('receiptCount')} />
        <KpiCard label="Bon mediu" value={formatLei(summary.avgReceiptValue)} trend={trend('avgReceiptValue')} />
        <KpiCard
          label="Cross-sell"
          value={formatPct(summary.crossSellPct)}
          hint={`${formatNumber(summary.crossSellReceipts)} din ${formatNumber(summary.fuelReceiptCount)} bonuri carburant`}
          trend={trend('crossSellPct')}
        />
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
          label="Profit brut estimat"
          value={formatLei(summary.grossProfitEstimate)}
          tone={summary.grossProfitEstimate >= 0 ? 'good' : 'bad'}
          hint={
            summary.grossProfitKnownShare < 0.99
              ? `${formatPct(summary.grossProfitKnownShare * 100, 0)} din vânzări au preț de achiziție cunoscut`
              : undefined
          }
          trend={trend('grossProfitEstimate')}
        />
        <KpiCard
          label="Produse cu vânzare lentă"
          value={
            <Link to="/vanzare-slaba" className="hover:text-brand-600">
              {formatNumber(noSale30.length)}
            </Link>
          }
          hint="fără vânzare în ultimele 30 zile"
          tone={noSale30.length > 0 ? 'warn' : 'default'}
        />
        <KpiCard
          label="Produse cu scumpiri recente"
          value={
            <Link to="/furnizori" className="hover:text-brand-600">
              {formatNumber(priceHikes.length)}
            </Link>
          }
          hint="creștere &gt; 5% în ultimele 60 zile"
          tone={priceHikes.length > 0 ? 'bad' : 'default'}
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
