import { useState } from 'react'
import { exportExecutiveReport } from '../export/excelExport'
import { FilterBar } from '../components/FilterBar'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber } from '../lib/ro-format'

/** Executive Report (spec §31): un singur fișier Excel, multi-sheet, cu toate secțiunile principale ale perioadei selectate. */
export function ExecutiveReportPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const [exporting, setExporting] = useState(false)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)

  function handleExport() {
    setExporting(true)
    setDoneMessage(null)
    exportExecutiveReport(filters).finally(() => {
      setExporting(false)
      setDoneMessage('Fișierul „executive-report.xlsx” a fost descărcat.')
      setTimeout(() => setDoneMessage(null), 5000)
    })
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Executive Report</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Generează un singur fișier Excel cu Rezumat, Canale, Categorii, Clienți, Produse, Evoluție lunară și Alerte, pentru
        perioada selectată mai jos.
      </p>

      {totalTransactions === 0 ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 text-center">
          Nu există încă date importate. Mergi la „Import date" pentru a încărca primul export din Mentor.
        </div>
      ) : (
        <>
          <FilterBar filters={filters} patchFilters={patchFilters} clients={clients} products={products} categories={categories} />

          {loading || !result ? (
            <div className="text-sm text-slate-500">Se calculează…</div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                <div>
                  <div className="text-xs text-slate-400">Total vânzări</div>
                  <div className="font-semibold">{formatCurrency(result.totalValue)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Tranzacții</div>
                  <div className="font-semibold">{formatNumber(result.transactionCount)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Clienți distincți</div>
                  <div className="font-semibold">{formatNumber(result.distinctClients)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Produse distincte</div>
                  <div className="font-semibold">{formatNumber(result.distinctProducts)}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={exporting || result.transactionCount === 0}
                  className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {exporting ? 'Se generează…' : 'Descarcă Executive Report'}
                </button>
                {doneMessage && <span className="text-xs text-emerald-600 dark:text-emerald-400">{doneMessage}</span>}
              </div>
              {result.transactionCount === 0 && (
                <div className="text-xs text-slate-400 mt-2">Niciun rând nu corespunde filtrelor selectate.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
