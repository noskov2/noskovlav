import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/filters/FilterBar'
import { Tabs } from '@/components/ui/Tabs'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { filterTransactions } from '@/kpi/applyFilters'
import { computeCrossSellReport } from '@/kpi/crossSell'
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

export function CrossSellPage() {
  const { transactions, products, cashiers, productsById } = useDataStore()
  const { filter } = useFilterStore()
  const [tab, setTab] = useState('fuel')

  const filtered = useMemo(() => filterTransactions(transactions, filter, productsById), [transactions, filter, productsById])
  const report = useMemo(() => computeCrossSellReport(filtered, products, cashiers), [filtered, products, cashiers])

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Cross-sell și performanța casierilor" />
        <EmptyState />
      </div>
    )
  }

  const tabProps = { transactions: filtered, products, report }

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
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
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
