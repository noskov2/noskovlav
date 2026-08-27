import { mergeWithComparison } from '../analytics/compare'
import { BreakdownTable } from '../components/BreakdownTable'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'

/** Analiză Categorii (spec §16): valoare, cantitate, tranzacții, clienți, pondere, evoluție vs. comparație. */
export function CategoriesPage() {
  const { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories } = useReportData()

  return (
    <ReportShell
      title="Analiză categorii"
      description="Vânzări pe fiecare categorie de produse, cu evoluție față de perioada de comparație."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      hide={{ category: true }}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {(r) => (
        <BreakdownTable
          rows={mergeWithComparison(r.byCategory, comparison?.byCategory ?? null, r.totalValue)}
          nameLabel="Categorie"
          showClients
          showProducts
          showComparison={!!filters.comparisonPeriod}
        />
      )}
    </ReportShell>
  )
}
