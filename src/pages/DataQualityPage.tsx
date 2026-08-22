import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DrillValue } from '@/components/ui/DrillValue'
import { useDataStore } from '@/store/dataStore'
import { computeDataQualityReport } from '@/kpi/dataQuality'
import { formatNumber, formatPct } from '@/lib/format'

function scoreTone(score: number): { color: string; bg: string; label: string } {
  if (score >= 90) return { color: 'text-good', bg: 'bg-good/10', label: 'Foarte bună' }
  if (score >= 75) return { color: 'text-warn', bg: 'bg-warn/10', label: 'Acceptabilă' }
  return { color: 'text-bad', bg: 'bg-bad/10', label: 'Necesită atenție' }
}

export function DataQualityPage() {
  const { transactions, products, cashiers, importBatches, supplierReceipts } = useDataStore()

  const report = useMemo(
    () => computeDataQualityReport(transactions, products, cashiers, importBatches, supplierReceipts),
    [transactions, products, cashiers, importBatches, supplierReceipts],
  )

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Calitatea datelor" />
        <EmptyState description="Scorul de calitate apare aici după primul import de vânzări." />
      </div>
    )
  }

  const tone = scoreTone(report.score)

  return (
    <div>
      <PageHeader
        title="Calitatea datelor"
        description="Cât de sigur poți fi pe cifrele din celelalte module — fiecare factor de mai jos e clickabil pentru detalii."
      />

      <div className="mb-5 flex items-center gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full ${tone.bg}`}>
          <span className={`text-3xl font-bold ${tone.color}`}>{Math.round(report.score)}</span>
        </div>
        <div>
          <p className={`text-sm font-semibold ${tone.color}`}>{tone.label}</p>
          <p className="text-sm text-slate-500">
            Calitatea datelor: {formatPct(report.score, 1)} — medie ponderată a factorilor de mai jos (bonuri,
            categorizare, cost, casieri, produse revizuite, rânduri valide la import).
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {report.factors.map((f) => {
          const factorTone = scoreTone(f.healthPct)
          return (
            <div key={f.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-800">{f.label}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${factorTone.bg} ${factorTone.color}`}>
                  {formatPct(f.healthPct, 1)}
                </span>
              </div>
              <p className="text-sm text-slate-500">{f.detail}</p>
              {f.affectedLines.length > 0 && (
                <p className="mt-1.5 text-xs">
                  <DrillValue title={f.label} lines={f.affectedLines}>
                    Vezi cele {formatNumber(f.affectedCount)} linii afectate
                  </DrillValue>
                </p>
              )}
              {f.key === 'categorization' && f.affectedCount > 0 && (
                <p className="mt-1 text-xs">
                  <Link to="/nomenclator" className="text-brand-700 hover:underline">
                    Deschide Nomenclator → Produse
                  </Link>
                </p>
              )}
              {f.key === 'reviewed' && f.affectedCount > 0 && (
                <p className="mt-1 text-xs">
                  <Link to="/nomenclator" className="text-brand-700 hover:underline">
                    Deschide Nomenclator → Produse (marcate „auto")
                  </Link>
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
