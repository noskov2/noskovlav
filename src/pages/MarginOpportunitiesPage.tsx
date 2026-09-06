import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/filters/FilterBar'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { filterTransactions } from '@/kpi/applyFilters'
import { computeProductProfitability } from '@/kpi/profitability'
import { computeMarginOpportunities, computePromoSuggestions, type MarginOpportunityRow } from '@/kpi/marginOpportunities'
import { formatLei, formatNumber, formatPct } from '@/lib/format'

export function MarginOpportunitiesPage() {
  const { transactions, products, productsById, cashiersById, supplierReceipts, settings } = useDataStore()
  const { filter } = useFilterStore()
  const vatRate = settings?.defaultVatRatePct ?? 19

  const filtered = useMemo(
    () => filterTransactions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )
  const productRows = useMemo(
    () => computeProductProfitability(filtered, products, supplierReceipts, vatRate),
    [filtered, products, supplierReceipts, vatRate],
  )
  const opportunities = useMemo(() => computeMarginOpportunities(productRows, vatRate), [productRows, vatRate])
  const suggestions = useMemo(
    () => computePromoSuggestions(opportunities, productRows, products, vatRate),
    [opportunities, productRows, products, vatRate],
  )

  const anyCostKnown = productRows.some((r) => r.costCoverage > 0)
  const totalPotential = useMemo(() => opportunities.reduce((s, o) => s + o.potentialExtraProfit, 0), [opportunities])

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Marjă & Promoții" />
        <EmptyState />
      </div>
    )
  }

  const columns: DataTableColumn<MarginOpportunityRow>[] = [
    { key: 'name', header: 'Produs', render: (o) => o.row.product.name, sortValue: (o) => o.row.product.name },
    { key: 'category', header: 'Categorie', render: (o) => o.category, sortValue: (o) => o.category },
    {
      key: 'qty',
      header: 'Cantitate',
      align: 'right',
      render: (o) => (
        <DrillValue title={`${o.row.product.name} — vânzări`} lines={filtered.filter((t) => t.productId === o.row.product.id)}>
          {formatNumber(o.row.quantity, 2)}
        </DrillValue>
      ),
      sortValue: (o) => o.row.quantity,
    },
    {
      key: 'currentPrice',
      header: 'Preț actual (RON/buc)',
      align: 'right',
      render: (o) => formatLei(o.currentUnitPriceInclVat),
      sortValue: (o) => o.currentUnitPriceInclVat,
    },
    {
      key: 'ownMargin',
      header: 'Marjă produs',
      align: 'right',
      render: (o) => formatPct(o.row.marginPct ?? 0),
      sortValue: (o) => o.row.marginPct ?? -Infinity,
    },
    {
      key: 'catMargin',
      header: 'Marjă medie categorie',
      align: 'right',
      render: (o) => formatPct(o.categoryAvgMarginPct),
      sortValue: (o) => o.categoryAvgMarginPct,
    },
    {
      key: 'gap',
      header: 'Diferență',
      align: 'right',
      render: (o) => <span className="font-medium text-bad">−{formatPct(o.marginGapPp)}</span>,
      sortValue: (o) => o.marginGapPp,
    },
    {
      key: 'targetPrice',
      header: 'Preț recomandat (RON/buc)',
      align: 'right',
      render: (o) => (o.targetUnitPriceInclVat != null ? formatLei(o.targetUnitPriceInclVat) : 'cost necunoscut'),
      sortValue: (o) => o.targetUnitPriceInclVat ?? -1,
    },
    {
      key: 'potential',
      header: 'Profit suplimentar potențial',
      align: 'right',
      render: (o) => <span className="font-semibold text-slate-900">{formatLei(o.potentialExtraProfit)}</span>,
      sortValue: (o) => o.potentialExtraProfit,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Marjă & Promoții"
        description="Produse a căror marjă e prea mică față de restul categoriei din care fac parte, cu preț de vânzare recomandat — plus propuneri de promoții săptămânale care mișcă vânzarea fără să te lase pe pierdere."
      />
      <div className="mb-5">
        <FilterBar />
      </div>

      {!anyCostKnown && (
        <p className="mb-4 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
          Nu există preț de achiziție pentru produsele din perioada selectată — marja nu poate fi calculată, deci nici
          o comparație. Completează prețurile de achiziție în <strong>Nomenclator</strong> sau importă coloana
          corespunzătoare.
        </p>
      )}

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Produse cu marjă sub categorie</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(opportunities.length)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Profit suplimentar potențial</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatLei(totalPotential)}</p>
            <p className="text-xs text-slate-500">dacă fiecare ar ajunge la marja medie a categoriei sale</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Propuneri de promoții</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(suggestions.length)}</p>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Produse cu marjă prea mică</h3>
        <p className="mb-3 text-xs text-slate-500">
          Comparate cu media categoriei lor (nu cu tot magazinul — un carburant nu se compară cu o cafea). Doar
          produse cu vânzări reale în perioadă (peste 30 lei) și cel puțin un alt produs în aceeași categorie.
        </p>
        <DataTable
          columns={columns}
          rows={opportunities}
          rowKey={(o) => o.row.product.id}
          searchable
          searchPredicate={(o, q) => o.row.product.name.toLowerCase().includes(q)}
          defaultSortKey="potential"
          pageSize={30}
          emptyMessage="Niciun produs nu iese sub marja medie a categoriei lui în perioada selectată."
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Propuneri de promoții — o săptămână</h3>
        <p className="mb-4 text-xs text-slate-500">
          Fiecare combină un produs de mai sus cu unul dintre cele mai vândute produse din restul magazinului (nu
          carburant) — ideea fiind să atragă clienți prin produsul popular, în timp ce discountul e calculat să nu
          coboare profitul pachetului sub {formatPct(8, 0)} marjă. Discountul e o pornire de discuție, nu o regulă
          fixă — tu cunoști clienții.
        </p>
        {suggestions.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">
            Nu am găsit o combinație care să rămână profitabilă cu produsele și costurile disponibile în perioada
            selectată.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s) => (
              <div key={s.primary.row.product.id} className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {s.anchor.product.name} + {s.primary.row.product.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {s.anchor.product.name} e unul dintre cele mai vândute produse ({formatNumber(s.anchor.quantity, 0)}{' '}
                  buc. în perioadă) — atrage clienți spre {s.primary.row.product.name}, care are marja cu{' '}
                  {formatPct(s.primary.marginGapPp)} sub media categoriei „{s.primary.category}”.
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-brand-700">{formatLei(s.promoPriceInclVat)}</span>
                  <span className="text-xs text-slate-400 line-through">{formatLei(s.normalComboPriceInclVat)}</span>
                  <span className="text-xs font-medium text-good">−{formatNumber(s.discountPct, 0)}%</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {s.comboMarginPct != null && s.comboCostExVat != null && s.comboProfitExVat != null ? (
                    <>
                      Cost pachet: {formatLei(s.comboCostExVat)} · profit estimat: {formatLei(s.comboProfitExVat)} ·
                      marjă pachet: {formatPct(s.comboMarginPct)}
                    </>
                  ) : (
                    'Costul unuia dintre produse nu e cunoscut — verifică marja înainte să pornești promoția.'
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
