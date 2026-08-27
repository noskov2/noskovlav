import { mergeWithComparison } from '../analytics/compare'
import { BreakdownTable } from '../components/BreakdownTable'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'

/** Analiză Canale (spec §16): valoare, cantitate, tranzacții, clienți, preț mediu, pondere, diferență vs. comparație. */
export function ChannelsPage() {
  const { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories } = useReportData()

  return (
    <ReportShell
      title="Analiză canale"
      description="Vânzări pe fiecare canal, cu evoluție față de perioada de comparație."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      hide={{ channel: true }}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {(r) => (
        <BreakdownTable
          rows={mergeWithComparison(r.byChannel, comparison?.byChannel ?? null, r.totalValue)}
          nameLabel="Canal"
          showClients
          showProducts
          showComparison={!!filters.comparisonPeriod}
        />
      )}
    </ReportShell>
  )
}
