import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/filters/FilterBar'
import { Tabs } from '@/components/ui/Tabs'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { filterTransactions } from '@/kpi/applyFilters'
import { computeCrossSellReport } from '@/kpi/crossSell'
import { computeTeamRollup } from '@/kpi/teamRollup'
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

  const filtered = useMemo(
    () => filterTransactions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const report = useMemo(() => computeCrossSellReport(filtered, products, cashiers), [filtered, products, cashiers])
  const teamRows = useMemo(() => computeTeamRollup(report.cashiers, teams), [report, teams])

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
