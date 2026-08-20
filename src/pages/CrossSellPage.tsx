import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/filters/FilterBar'
import { Tabs } from '@/components/ui/Tabs'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { effectiveRange } from '@/kpi/filterState'
import { filterTransactions, filterByDimensions, filterByRange } from '@/kpi/applyFilters'
import { computeCrossSellReport } from '@/kpi/crossSell'
import { computeTeamRollup } from '@/kpi/teamRollup'
import { previousMonthRange, computeDelta, type Delta } from '@/kpi/monthComparison'
import { formatLei, formatNumber, formatPct } from '@/lib/format'
import { FuelTab } from '@/pages/crossSell/FuelTab'
import { CoffeeTab } from '@/pages/crossSell/CoffeeTab'
import { VitrinaTab } from '@/pages/crossSell/VitrinaTab'
import { SandwichTab } from '@/pages/crossSell/SandwichTab'
import { LemonadeTab } from '@/pages/crossSell/LemonadeTab'
import { ScoreTab } from '@/pages/crossSell/ScoreTab'

const TABS = [
  { key: 'fuel', label: 'Carburant + Marfă' },
  { key: 'coffee', label: 'Cafea' },
  { key: 'vitrina', label: 'Dulciuri Vitrină' },
  { key: 'sandwich', label: 'Sandwich-uri' },
  { key: 'lemonade', label: 'Limonade/Ceaiuri' },
  { key: 'score', label: 'Score Casieri' },
]

type GroupBy = 'casier' | 'echipa'

export function CrossSellPage() {
  const { transactions, products, cashiers, teams, productsById, cashiersById } = useDataStore()
  const { filter } = useFilterStore()
  const [tab, setTab] = useState('fuel')
  const [groupBy, setGroupBy] = useState<GroupBy>('casier')
  const [compare, setCompare] = useState(false)

  const filtered = useMemo(
    () => filterTransactions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const report = useMemo(() => computeCrossSellReport(filtered, products, cashiers), [filtered, products, cashiers])
  const teamRows = useMemo(() => computeTeamRollup(report.cashiers, teams), [report, teams])

  const range = effectiveRange(filter)
  const dimFiltered = useMemo(
    () => filterByDimensions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const prevRange = useMemo(() => previousMonthRange(range), [range])
  const prevFiltered = useMemo(() => filterByRange(dimFiltered, prevRange.start, prevRange.end), [dimFiltered, prevRange])
  const prevReport = useMemo(
    () => computeCrossSellReport(prevFiltered, products, cashiers),
    [prevFiltered, products, cashiers],
  )

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Cross-sell și performanța casierilor" />
        <EmptyState />
      </div>
    )
  }

  const displayReport = groupBy === 'echipa' ? { stationTotal: report.stationTotal, cashiers: teamRows } : report
  const tabProps = { transactions: filtered, products, report: displayReport, cashiersById }

  return (
    <div>
      <PageHeader
        title="Cross-sell și performanța casierilor"
        description="Analiza pe bon: carburant + marfă, cafea, dulciuri vitrină, sandwich-uri, limonade/ceaiuri și scorul general al casierilor."
      />
      <div className="mb-5">
        <FilterBar hideCategory hideProduct />
      </div>

      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        Compară stația cu luna anterioară
      </label>

      {compare && (
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
          <CompareStat label="Vânzări" current={formatLei(report.stationTotal.totalSales)} delta={computeDelta(report.stationTotal.totalSales, prevReport.stationTotal.totalSales)} />
          <CompareStat label="Bonuri" current={formatNumber(report.stationTotal.totalReceipts)} delta={computeDelta(report.stationTotal.totalReceipts, prevReport.stationTotal.totalReceipts)} />
          <CompareStat label="Cross-sell" current={formatPct(report.stationTotal.crossSellPct)} delta={computeDelta(report.stationTotal.crossSellPct, prevReport.stationTotal.crossSellPct)} />
          <CompareStat label="Cafea" current={formatNumber(report.stationTotal.coffee.total)} delta={computeDelta(report.stationTotal.coffee.total, prevReport.stationTotal.coffee.total)} />
          <CompareStat label="Dulciuri vitrină" current={formatNumber(report.stationTotal.vitrina.quantity)} delta={computeDelta(report.stationTotal.vitrina.quantity, prevReport.stationTotal.vitrina.quantity)} />
          <CompareStat label="Sandwich-uri" current={formatNumber(report.stationTotal.sandwich.total)} delta={computeDelta(report.stationTotal.sandwich.total, prevReport.stationTotal.sandwich.total)} />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
          <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
            <button
              onClick={() => setGroupBy('casier')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                groupBy === 'casier' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Pe casier
            </button>
            <button
              onClick={() => setGroupBy('echipa')}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                groupBy === 'echipa' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Pe echipă
            </button>
          </div>
        </div>
        <div className="mt-4">
          {tab === 'fuel' && <FuelTab {...tabProps} />}
          {tab === 'coffee' && <CoffeeTab {...tabProps} />}
          {tab === 'vitrina' && <VitrinaTab {...tabProps} />}
          {tab === 'sandwich' && <SandwichTab {...tabProps} />}
          {tab === 'lemonade' && <LemonadeTab {...tabProps} />}
          {tab === 'score' && <ScoreTab {...tabProps} />}
        </div>
      </div>
    </div>
  )
}

function CompareStat({ label, current, delta }: { label: string; current: string; delta: Delta }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{current}</p>
      <div className="mt-1">
        <DeltaBadge delta={delta} />
      </div>
    </div>
  )
}
