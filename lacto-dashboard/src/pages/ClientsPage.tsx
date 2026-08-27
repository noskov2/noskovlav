import { useNavigate } from 'react-router-dom'
import { mergeWithComparison } from '../analytics/compare'
import { BreakdownTable } from '../components/BreakdownTable'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'

/** Analiză Clienți (spec §16): valoare, cantitate, tranzacții, preț mediu, pondere, diferență vs. comparație. */
export function ClientsPage() {
  const { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()

  return (
    <ReportShell
      title="Analiză clienți"
      description="Vânzări pe fiecare client, cu evoluție față de perioada de comparație. Apasă un client pentru profilul complet (Client 360°)."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      hide={{ client: true }}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {(r) => (
        <BreakdownTable
          rows={mergeWithComparison(r.byClient, comparison?.byClient ?? null, r.totalValue)}
          nameLabel="Client"
          showProducts
          showComparison={!!filters.comparisonPeriod}
          onRowClick={(row) => row.id !== null && navigate(`/clienti/${row.id}`)}
        />
      )}
    </ReportShell>
  )
}
