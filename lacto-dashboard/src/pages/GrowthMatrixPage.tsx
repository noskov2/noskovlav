import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { computeClientDynamics } from '../analytics/clientDynamics'
import type { ClientDynamicsResult } from '../analytics/clientDynamics'
import { ReportShell } from '../components/ReportShell'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber, formatPercent } from '../lib/ro-format'

type Quadrant = 'mare-crestere' | 'mare-scadere' | 'mic-crestere' | 'mic-scadere'

const QUADRANT_LABEL: Record<Quadrant, string> = {
  'mare-crestere': 'Client mare + creștere',
  'mare-scadere': 'Client mare + scădere',
  'mic-crestere': 'Client mic + creștere',
  'mic-scadere': 'Client mic + scădere',
}

const QUADRANT_COLOR: Record<Quadrant, string> = {
  'mare-crestere': '#059669',
  'mare-scadere': '#e11d48',
  'mic-crestere': '#38bdf8',
  'mic-scadere': '#f59e0b',
}

interface Point {
  id: number
  name: string
  value: number
  growthPercent: number
  quadrant: Quadrant
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Matrice creștere clienți (spec §22): scatter valoare × creștere %, 4 cadrane. */
export function GrowthMatrixPage() {
  const { filters, patchFilters, result, loading, totalTransactions, clients, products, categories } = useReportData()
  const navigate = useNavigate()
  const [dynamics, setDynamics] = useState<ClientDynamicsResult | null | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setDynamics(undefined)
    computeClientDynamics(filters).then((d) => {
      if (!cancelled) setDynamics(d)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  const points = useMemo<Point[]>(() => {
    if (!dynamics) return []
    const active = dynamics.rows.filter((r) => (r.status === 'crescut' || r.status === 'scazut' || r.status === 'activ') && r.diffPercent !== null)
    const sizeThreshold = median(active.map((r) => r.currentValue))
    return active.map((r) => {
      const isLarge = r.currentValue >= sizeThreshold
      const isGrowing = (r.diffPercent ?? 0) >= 0
      const quadrant: Quadrant = isLarge ? (isGrowing ? 'mare-crestere' : 'mare-scadere') : isGrowing ? 'mic-crestere' : 'mic-scadere'
      return { id: r.id, name: r.name, value: r.currentValue, growthPercent: r.diffPercent ?? 0, quadrant }
    })
  }, [dynamics])

  const countByQuadrant = useMemo(() => {
    const counts: Record<Quadrant, number> = { 'mare-crestere': 0, 'mare-scadere': 0, 'mic-crestere': 0, 'mic-scadere': 0 }
    for (const p of points) counts[p.quadrant]++
    return counts
  }, [points])

  return (
    <ReportShell
      title="Matrice creștere clienți"
      description="Valoarea vânzărilor (X) versus creșterea % față de perioada de comparație (Y) — patru cadrane de management."
      filters={filters}
      patchFilters={patchFilters}
      clients={clients}
      products={products}
      categories={categories}
      totalTransactions={totalTransactions}
      loading={loading}
      result={result}
    >
      {() =>
        !filters.comparisonPeriod ? (
          <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
            Selectează o perioadă de comparație pentru a calcula matricea de creștere.
          </div>
        ) : dynamics === undefined ? (
          <div className="text-sm text-slate-500">Se calculează…</div>
        ) : points.length === 0 ? (
          <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
            Nu există suficienți clienți activi în ambele perioade pentru o matrice relevantă.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {(Object.keys(QUADRANT_LABEL) as Quadrant[]).map((q) => (
                <div key={q} className="border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                  <span className="text-xs" style={{ color: QUADRANT_COLOR[q] }}>
                    ● {QUADRANT_LABEL[q]}
                  </span>
                  <div className="text-lg font-semibold mt-1">{formatNumber(countByQuadrant[q])}</div>
                </div>
              ))}
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
              <div style={{ width: '100%', height: 420 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" dataKey="value" name="Valoare" tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 11 }} />
                    <YAxis type="number" dataKey="growthPercent" name="Creștere %" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <ZAxis range={[60, 60]} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      formatter={(v, name) => (name === 'Valoare' ? formatCurrency(Number(v)) : formatPercent(Number(v)))}
                      labelFormatter={() => ''}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const p = payload[0].payload as Point
                        return (
                          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs shadow-lg">
                            <div className="font-medium">{p.name}</div>
                            <div>{formatCurrency(p.value)}</div>
                            <div>{formatPercent(p.growthPercent)}</div>
                          </div>
                        )
                      }}
                    />
                    {(Object.keys(QUADRANT_LABEL) as Quadrant[]).map((q) => (
                      <Scatter
                        key={q}
                        name={QUADRANT_LABEL[q]}
                        data={points.filter((p) => p.quadrant === q)}
                        fill={QUADRANT_COLOR[q]}
                        onClick={(p: any) => navigate(`/clienti/${p.id}`)}
                        cursor="pointer"
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }
    </ReportShell>
  )
}
