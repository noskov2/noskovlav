import { useMemo } from 'react'
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
import { formatLei, formatNumber, formatPct } from '@/lib/format'

export function DashboardPage() {
  const { transactions, products, cashiers, supplierReceipts, productsById } = useDataStore()
  const { filter } = useFilterStore()
  const range = effectiveRange(filter)

  const dimFiltered = useMemo(
    () => filterByDimensions(transactions, filter, productsById),
    [transactions, filter, productsById],
  )
  const periodTx = useMemo(() => filterByRange(dimFiltered, range.start, range.end), [dimFiltered, range])
  const summary = useMemo(() => computePeriodSummary(periodTx, products), [periodTx, products])

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
        />
        <KpiCard
          label="Marfă"
          value={
            <DrillValue title="Vânzări marfă" lines={periodTx.filter((t) => !fuelIds.has(t.productId))}>
              {formatLei(summary.goodsSales)}
            </DrillValue>
          }
        />
        <KpiCard
          label="Carburant"
          value={
            <DrillValue title="Vânzări carburant" lines={periodTx.filter((t) => fuelIds.has(t.productId))}>
              {formatLei(summary.fuelSales)}
            </DrillValue>
          }
          hint={`${formatNumber(summary.fuelLiters, 0)} litri${summary.gplLiters > 0 ? ` · GPL ${formatNumber(summary.gplLiters, 0)} L` : ''}`}
        />
        <KpiCard label="Bonuri" value={formatNumber(summary.receiptCount)} />
        <KpiCard label="Bon mediu" value={formatLei(summary.avgReceiptValue)} />
        <KpiCard
          label="Cross-sell"
          value={formatPct(summary.crossSellPct)}
          hint={`${formatNumber(summary.crossSellReceipts)} din ${formatNumber(summary.fuelReceiptCount)} bonuri carburant`}
        />
        <KpiCard
          label="Cafele"
          value={
            <DrillValue title="Cafele vândute" lines={periodTx.filter((t) => coffeeIds.has(t.productId))}>
              {formatNumber(summary.coffeeCount)}
            </DrillValue>
          }
        />
        <KpiCard
          label="Sandwich-uri"
          value={
            <DrillValue title="Sandwich-uri vândute" lines={periodTx.filter((t) => sandwichIds.has(t.productId))}>
              {formatNumber(summary.sandwichCount)}
            </DrillValue>
          }
        />
        <KpiCard
          label="Dulciuri vitrină"
          value={
            <DrillValue title="Dulciuri vitrină vândute" lines={periodTx.filter((t) => vitrinaIds.has(t.productId))}>
              {formatNumber(summary.vitrinaCount)}
            </DrillValue>
          }
        />
        <KpiCard
          label="Limonade/ceai"
          value={
            <DrillValue title="Limonade/ceaiuri vândute" lines={periodTx.filter((t) => lemonadeIds.has(t.productId))}>
              {formatNumber(summary.lemonadeCount)}
            </DrillValue>
          }
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

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Evoluția vânzărilor totale</h3>
        <TrendChart data={dailySeries.map((p) => ({ date: p.date, value: p.summary.totalSales }))} />
      </div>
    </div>
  )
}
