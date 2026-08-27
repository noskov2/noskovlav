import { mergeWithComparison } from '../analytics/compare'
import { BreakdownTable } from '../components/BreakdownTable'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'

/** Analiză Produse (spec §16): categorie, valoare, cantitate, tranzacții, preț mediu, pondere, evoluție. */
export function ProductsPage() {
  const { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories } = useReportData()

  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]))
  const productCategoryId = new Map((products ?? []).map((p) => [p.id, p.categoryId ?? null]))

  return (
    <ReportShell
      title="Analiză produse"
      description="Vânzări pe fiecare produs, cu categorie și evoluție față de perioada de comparație."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      hide={{ product: true }}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {(r) => (
        <BreakdownTable
          rows={mergeWithComparison(r.byProduct, comparison?.byProduct ?? null, r.totalValue)}
          nameLabel="Produs"
          showClients
          showComparison={!!filters.comparisonPeriod}
          extraColumn={{
            label: 'Categorie',
            render: (row) => {
              if (row.id === null) return '—'
              const categoryId = productCategoryId.get(row.id)
              return categoryId ? (categoryNameById.get(categoryId) ?? '—') : 'Fără categorie'
            },
          }}
        />
      )}
    </ReportShell>
  )
}
