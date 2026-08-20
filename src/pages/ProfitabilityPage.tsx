import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/filters/FilterBar'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import { Tabs } from '@/components/ui/Tabs'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { effectiveRange } from '@/kpi/filterState'
import { filterTransactions, filterByDimensions, filterByRange } from '@/kpi/applyFilters'
import {
  computeCategoryProfitability,
  computeProductProfitability,
  type CategoryProfitRow,
  type ProductProfitRow,
} from '@/kpi/profitability'
import { previousMonthRange, computeDelta } from '@/kpi/monthComparison'
import { formatLei, formatNumber, formatPct } from '@/lib/format'

type RankingKey = 'sales' | 'profit' | 'margin' | 'highSalesLowProfit' | 'lowSalesHighMargin'

const RANKING_TABS: { key: RankingKey; label: string }[] = [
  { key: 'sales', label: 'Top vânzări' },
  { key: 'profit', label: 'Top profit' },
  { key: 'margin', label: 'Top marjă' },
  { key: 'highSalesLowProfit', label: 'Vânzări mari, profit mic' },
  { key: 'lowSalesHighMargin', label: 'Vânzări mici, marjă bună' },
]

export function ProfitabilityPage() {
  const { transactions, products, productsById, cashiersById } = useDataStore()
  const { filter } = useFilterStore()
  const range = effectiveRange(filter)
  const filtered = useMemo(
    () => filterTransactions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )

  const productRows = useMemo(() => computeProductProfitability(filtered, products), [filtered, products])
  const categoryRows = useMemo(() => computeCategoryProfitability(productRows), [productRows])

  const [compare, setCompare] = useState(false)
  const dimFiltered = useMemo(
    () => filterByDimensions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const prevRange = useMemo(() => previousMonthRange(range), [range])
  const prevFiltered = useMemo(() => filterByRange(dimFiltered, prevRange.start, prevRange.end), [dimFiltered, prevRange])
  const prevCategoryRows = useMemo(
    () => computeCategoryProfitability(computeProductProfitability(prevFiltered, products)),
    [prevFiltered, products],
  )
  const prevSalesByCategory = useMemo(
    () => new Map(prevCategoryRows.map((c) => [c.category, c.salesValue])),
    [prevCategoryRows],
  )

  const [ranking, setRanking] = useState<RankingKey>('sales')

  const rankedCategories = useMemo(() => {
    const withProfit = categoryRows.filter((c) => c.grossProfit != null)
    switch (ranking) {
      case 'sales':
        return [...categoryRows].sort((a, b) => b.salesValue - a.salesValue).slice(0, 8)
      case 'profit':
        return [...withProfit].sort((a, b) => (b.grossProfit ?? 0) - (a.grossProfit ?? 0)).slice(0, 8)
      case 'margin':
        return [...withProfit].sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0)).slice(0, 8)
      case 'highSalesLowProfit':
        return [...withProfit]
          .filter((c) => (c.marginPct ?? 100) < 15)
          .sort((a, b) => b.shareOfSales - a.shareOfSales)
          .slice(0, 8)
      case 'lowSalesHighMargin':
        return [...withProfit]
          .filter((c) => (c.marginPct ?? 0) > 30)
          .sort((a, b) => a.shareOfSales - b.shareOfSales)
          .slice(0, 8)
    }
  }, [categoryRows, ranking])

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Profitabilitate pe categorii" />
        <EmptyState />
      </div>
    )
  }

  const categoryColumns: DataTableColumn<CategoryProfitRow>[] = [
    { key: 'category', header: 'Categorie', render: (r) => r.category, sortValue: (r) => r.category },
    { key: 'qty', header: 'Cantitate', align: 'right', render: (r) => formatNumber(r.quantity, 2), sortValue: (r) => r.quantity },
    { key: 'sales', header: 'Vânzări', align: 'right', render: (r) => formatLei(r.salesValue), sortValue: (r) => r.salesValue },
    {
      key: 'cost',
      header: 'Cost marfă',
      align: 'right',
      render: (r) => (r.costValue != null ? formatLei(r.costValue) : '—'),
      sortValue: (r) => r.costValue ?? -1,
    },
    {
      key: 'profit',
      header: 'Profit brut',
      align: 'right',
      render: (r) => (r.grossProfit != null ? formatLei(r.grossProfit) : 'necunoscut'),
      sortValue: (r) => r.grossProfit ?? -Infinity,
    },
    {
      key: 'margin',
      header: 'Marjă %',
      align: 'right',
      render: (r) => (r.marginPct != null ? formatPct(r.marginPct) : '—'),
      sortValue: (r) => r.marginPct ?? -Infinity,
    },
    { key: 'shareSales', header: '% din vânzări', align: 'right', render: (r) => formatPct(r.shareOfSales), sortValue: (r) => r.shareOfSales },
    {
      key: 'shareProfit',
      header: '% din profit',
      align: 'right',
      render: (r) => (r.shareOfProfit != null ? formatPct(r.shareOfProfit) : '—'),
      sortValue: (r) => r.shareOfProfit ?? -Infinity,
    },
    ...(compare
      ? ([
          {
            key: 'vsLastMonth',
            header: 'vs. luna anterioară',
            align: 'right',
            render: (r) => {
              const prev = prevSalesByCategory.get(r.category) ?? 0
              return <DeltaBadge delta={computeDelta(r.salesValue, prev)} />
            },
            sortValue: (r) => {
              const prev = prevSalesByCategory.get(r.category) ?? 0
              return computeDelta(r.salesValue, prev).pct ?? -Infinity
            },
          },
        ] as DataTableColumn<CategoryProfitRow>[])
      : []),
  ]

  const productColumns: DataTableColumn<ProductProfitRow>[] = [
    { key: 'name', header: 'Produs', render: (r) => r.product.name, sortValue: (r) => r.product.name },
    { key: 'category', header: 'Categorie', render: (r) => r.product.category, sortValue: (r) => r.product.category },
    {
      key: 'qty',
      header: 'Cantitate',
      align: 'right',
      render: (r) => (
        <DrillValue title={`${r.product.name} — vânzări`} lines={filtered.filter((t) => t.productId === r.product.id)}>
          {formatNumber(r.quantity, 2)}
        </DrillValue>
      ),
      sortValue: (r) => r.quantity,
    },
    {
      key: 'salesNoVat',
      header: 'Vânzări fără TVA',
      align: 'right',
      render: (r) => (r.salesValueNoVat != null ? formatLei(r.salesValueNoVat) : '—'),
      sortValue: (r) => r.salesValueNoVat ?? -1,
    },
    { key: 'sales', header: 'Vânzări totale', align: 'right', render: (r) => formatLei(r.salesValue), sortValue: (r) => r.salesValue },
    {
      key: 'cost',
      header: 'Cost marfă',
      align: 'right',
      render: (r) => (r.costValue != null ? formatLei(r.costValue) : 'necunoscut'),
      sortValue: (r) => r.costValue ?? -1,
    },
    {
      key: 'profit',
      header: 'Profit brut',
      align: 'right',
      render: (r) => (r.grossProfit != null ? formatLei(r.grossProfit) : '—'),
      sortValue: (r) => r.grossProfit ?? -Infinity,
    },
    {
      key: 'margin',
      header: 'Marjă %',
      align: 'right',
      render: (r) => (r.marginPct != null ? formatPct(r.marginPct) : '—'),
      sortValue: (r) => r.marginPct ?? -Infinity,
    },
    {
      key: 'markup',
      header: 'Adaos %',
      align: 'right',
      render: (r) => (r.markupPct != null ? formatPct(r.markupPct) : '—'),
      sortValue: (r) => r.markupPct ?? -Infinity,
    },
    { key: 'shareSales', header: '% vânzări', align: 'right', render: (r) => formatPct(r.shareOfSales), sortValue: (r) => r.shareOfSales },
    {
      key: 'shareProfit',
      header: '% profit',
      align: 'right',
      render: (r) => (r.shareOfProfit != null ? formatPct(r.shareOfProfit) : '—'),
      sortValue: (r) => r.shareOfProfit ?? -Infinity,
    },
  ]

  const anyCostKnown = productRows.some((r) => r.costKnown)

  return (
    <div>
      <PageHeader
        title="Profitabilitate pe categorii"
        description="Cât vinzi, dar și cât câștigi — pe baza prețului de achiziție configurat în Nomenclator sau importat."
      />
      <div className="mb-5">
        <FilterBar />
      </div>

      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        Compară vânzările pe categorie cu luna anterioară
      </label>

      {!anyCostKnown && (
        <p className="mb-4 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
          Nu există preț de achiziție pentru produsele din perioada selectată — profitul nu poate fi calculat.
          Completează prețurile de achiziție în <strong>Nomenclator</strong> sau importă coloana corespunzătoare.
        </p>
      )}

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Tabs
          tabs={RANKING_TABS.map((t) => ({ key: t.key, label: t.label }))}
          active={ranking}
          onChange={(k) => setRanking(k as RankingKey)}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {rankedCategories.map((c) => (
            <div key={c.category} className="rounded-lg border border-slate-100 p-3">
              <p className="truncate text-sm font-medium text-slate-800">{c.category}</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatLei(c.salesValue)}</p>
              <p className="text-xs text-slate-500">
                Profit: {c.grossProfit != null ? formatLei(c.grossProfit) : '—'} · Marjă:{' '}
                {c.marginPct != null ? formatPct(c.marginPct) : '—'}
              </p>
            </div>
          ))}
          {rankedCategories.length === 0 && (
            <p className="py-4 text-sm text-slate-400">Nu există categorii care să corespundă acestui clasament.</p>
          )}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Profitabilitate pe categorii — {formatRangeLabel(range)}</h3>
        <DataTable columns={categoryColumns} rows={categoryRows} rowKey={(r) => r.category} defaultSortKey="sales" pageSize={20} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Profitabilitate pe produs</h3>
        <DataTable
          columns={productColumns}
          rows={productRows}
          rowKey={(r) => r.product.id}
          searchable
          searchPredicate={(r, q) => r.product.name.toLowerCase().includes(q)}
          defaultSortKey="sales"
          pageSize={30}
        />
      </div>
    </div>
  )
}

function formatRangeLabel(range: { start: string; end: string }): string {
  return `${range.start} – ${range.end}`
}
