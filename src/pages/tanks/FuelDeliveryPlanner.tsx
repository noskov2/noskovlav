import { useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/Badge'
import { computeFuelDeliveryPlan, type AverageResult, type PlanDayRow, type StockNowResult } from '@/kpi/fuelDeliveryPlan'
import { addDays, reportingEndStr } from '@/kpi/dateRanges'
import { formatDateRo, formatNumber } from '@/lib/format'
import { downloadSimpleTable } from '@/reports/tankTablesWorkbook'
import type { FuelDeliveryPlanConfig, Product, TransactionLine } from '@/types/domain'

function toDatetimeLocalValue(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtTs(ms: number | null): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtL(n: number | null): string {
  if (n == null) return '—'
  return `${formatNumber(Math.round(n))} L`
}

const CONTENT_LABELS: Record<string, string> = {
  'benzina-peco': 'Benzină (Solomonescu Oil)',
  'motorina-peco': 'Motorină (Solomonescu Oil)',
  'motorina-lacto': 'Motorină (Lacto Solomonescu)',
  gol: 'gol',
}

export function FuelDeliveryPlanner({
  transactions,
  products,
  config,
  onConfigChange,
}: {
  transactions: TransactionLine[]
  products: Product[]
  config: FuelDeliveryPlanConfig
  onConfigChange: (patch: Partial<FuelDeliveryPlanConfig>) => Promise<void>
}) {
  // Alege un implicit la prima afișare (ultimele 30 de zile complete) — după
  // asta rămâne alegerea utilizatorului, salvată prin mecanismul existent.
  useEffect(() => {
    if (config.historyStart == null || config.historyEnd == null) {
      void onConfigChange({ historyStart: addDays(reportingEndStr(), -29), historyEnd: reportingEndStr() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.historyStart, config.historyEnd])

  const plan = useMemo(() => computeFuelDeliveryPlan(transactions, products, config), [transactions, products, config])

  function patch(p: Partial<FuelDeliveryPlanConfig>) {
    void onConfigChange(p)
  }
  function patchNumber(key: keyof FuelDeliveryPlanConfig, raw: string, opts?: { allowNull?: boolean }) {
    const trimmed = raw.trim()
    if (trimmed === '' && opts?.allowNull !== false) {
      patch({ [key]: null } as Partial<FuelDeliveryPlanConfig>)
      return
    }
    const value = Number(trimmed)
    if (Number.isFinite(value)) patch({ [key]: value } as Partial<FuelDeliveryPlanConfig>)
  }
  function patchCompartment(index: number, raw: string) {
    const value = Number(raw.trim())
    if (!Number.isFinite(value)) return
    const next = [...config.compartmentCapacitiesLiters]
    next[index] = value
    patch({ compartmentCapacitiesLiters: next })
  }
  function patchLactoCompartment(deliveryIndex: number, raw: string) {
    const next = { ...config.lactoCompartmentByDeliveryIndex }
    if (raw === '') delete next[deliveryIndex]
    else next[deliveryIndex] = Number(raw)
    patch({ lactoCompartmentByDeliveryIndex: next })
  }

  function exportDays() {
    void downloadSimpleTable(
      'Plan-alimentare-combustibil.xlsx',
      'Plan alimentare',
      ['Data', 'Stoc inițial benzină (L)', 'Vânzare benzină (L)', 'Stoc înainte de livrare benzină (L)', 'Livrare benzină (L)', 'Stoc final benzină (L)', 'Stoc final benzină (tone)',
        'Stoc inițial motorină (L)', 'Vânzare motorină (L)', 'Stoc înainte de livrare motorină (L)', 'Livrare motorină (L)', 'Stoc final motorină (L)', 'Stoc final motorină (tone)'],
      plan.days.map((d) => [
        formatDateRo(d.date),
        Math.round(d.benzina.stockInitial), Math.round(d.benzina.sale), Math.round(d.benzina.beforeDelivery), Math.round(d.benzina.deliveryLiters), Math.round(d.benzina.afterDelivery), Number(d.benzina.stockFinalTons.toFixed(3)),
        Math.round(d.motorina.stockInitial), Math.round(d.motorina.sale), Math.round(d.motorina.beforeDelivery), Math.round(d.motorina.deliveryLiters), Math.round(d.motorina.afterDelivery), Number(d.motorina.stockFinalTons.toFixed(3)),
      ]),
    )
  }

  const visibleDays = plan.days.slice(0, 20)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Plan de alimentare</h3>
        {plan.days.length > 0 && (
          <button
            onClick={exportDays}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ⬇ Exportă Excel
          </button>
        )}
      </div>

      {/* ---------- period + averages ---------- */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Perioadă istorică pentru calculul mediilor</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="date"
              value={config.historyStart ?? ''}
              onChange={(e) => patch({ historyStart: e.target.value || null })}
              className="rounded border border-slate-200 px-1.5 py-1"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={config.historyEnd ?? ''}
              onChange={(e) => patch({ historyEnd: e.target.value || null })}
              className="rounded border border-slate-200 px-1.5 py-1"
            />
          </div>
        </div>
        <AverageBox label="Medie benzină / zi" avg={plan.benzinaAvg} onManualChange={(raw) => patchNumber('manualAvgBenzinaLitersPerDay', raw)} />
        <AverageBox label="Medie motorină / zi" avg={plan.motorinaAvg} onManualChange={(raw) => patchNumber('manualAvgMotorinaLitersPerDay', raw)} />
      </div>

      {/* ---------- stock entry ---------- */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StockBox
          label="Stoc benzină raportat"
          liters={config.stockBenzinaLiters}
          asOf={config.stockBenzinaAsOf}
          result={plan.benzinaStockNow}
          onLitersChange={(raw) => patchNumber('stockBenzinaLiters', raw)}
          onAsOfChange={(ms) => patch({ stockBenzinaAsOf: ms })}
        />
        <StockBox
          label="Stoc motorină raportat"
          liters={config.stockMotorinaLiters}
          asOf={config.stockMotorinaAsOf}
          result={plan.motorinaStockNow}
          onLitersChange={(raw) => patchNumber('stockMotorinaLiters', raw)}
          onAsOfChange={(ms) => patch({ stockMotorinaAsOf: ms })}
        />
      </div>

      {/* ---------- summary stats ---------- */}
      {plan.days.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Zile acoperire benzină" value={plan.coverageDaysBenzina != null ? `${formatNumber(plan.coverageDaysBenzina, 1)} zile` : '—'} />
          <Stat label="Zile acoperire motorină" value={plan.coverageDaysMotorina != null ? `${formatNumber(plan.coverageDaysMotorina, 1)} zile` : '—'} />
          <Stat label="Stoc minim proiectat benzină" value={fmtL(plan.minProjectedBenzina)} />
          <Stat label="Stoc minim proiectat motorină" value={fmtL(plan.minProjectedMotorina)} />
        </div>
      )}

      {/* ---------- warnings ---------- */}
      {plan.warnings.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {plan.warnings.map((w, i) => (
            <div key={i} className={`rounded-lg border px-3 py-1.5 text-xs ${w.severity === 'bad' ? 'border-bad/30 bg-bad/5 text-bad' : 'border-warn/30 bg-warn/5 text-warn'}`}>
              {w.message}
            </div>
          ))}
        </div>
      )}

      {/* ---------- deliveries ---------- */}
      {plan.deliveries.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-slate-600">Curse de alimentare propuse</p>
          <p className="mb-2 text-[11px] text-slate-400">
            Pe cursele unde se transportă și pentru Lacto Solomonescu, alege mai jos ce compartiment (plin) merge la Lacto în loc de Solomonescu
            Oil — nicio alegere înseamnă că toată motorina de pe cursă merge la Solomonescu Oil.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1.5">Plecare</th>
                  <th className="px-2 py-1.5">Sosire Peco</th>
                  <th className="px-2 py-1.5">Compartimente</th>
                  <th className="px-2 py-1.5">Compartiment pentru Lacto Solomonescu</th>
                  <th className="px-2 py-1.5 text-right">Benzină Solomonescu Oil</th>
                  <th className="px-2 py-1.5 text-right">Motorină Solomonescu Oil</th>
                  <th className="px-2 py-1.5 text-right">Motorină Lacto Solomonescu</th>
                  <th className="px-2 py-1.5 text-right">Total cisternă</th>
                  <th className="px-2 py-1.5">Observații</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {plan.deliveries.map((d) => {
                  const benzinaCompartmentIdx = d.compartments.findIndex((c) => c.contents === 'benzina-peco')
                  return (
                    <tr key={d.index}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatDateRo(d.departureDate)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-700">{formatDateRo(d.arrivalDate)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {d.compartments.map((c, ci) => (
                            <span
                              key={ci}
                              className={`rounded border px-1.5 py-0.5 text-[10px] whitespace-nowrap ${
                                c.contents === 'gol' ? 'border-slate-100 text-slate-400' : 'border-slate-200 text-slate-600'
                              }`}
                            >
                              {formatNumber(c.capacityLiters)}L: {CONTENT_LABELS[c.contents]}
                              {c.contents !== 'gol' ? ` (${formatNumber(c.liters)}L)` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={config.lactoCompartmentByDeliveryIndex[d.index] ?? ''}
                          onChange={(e) => patchLactoCompartment(d.index, e.target.value)}
                          className="rounded border border-slate-200 px-1.5 py-1 text-xs"
                        >
                          <option value="">— (totul la Solomonescu Oil)</option>
                          {config.compartmentCapacitiesLiters.map((cap, ci) =>
                            ci === benzinaCompartmentIdx ? null : (
                              <option key={ci} value={ci}>
                                {formatNumber(cap)} L
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right">{fmtL(d.benzinaPecoLiters)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtL(d.motorinaPecoLiters)}</td>
                      <td className="px-2 py-1.5 text-right">{d.motorinaLactoLiters > 0 ? fmtL(d.motorinaLactoLiters) : '—'}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{fmtL(d.totalLiters)}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {d.motorinaLactoLiters > 0 && <Badge tone="brand">Lacto</Badge>}
                          {d.lactoConflict && <Badge tone="warn">Compartiment Lacto ocupat de benzină</Badge>}
                          {d.lateRisk && <Badge tone="bad">Risc întârziere</Badge>}
                          {d.benzinaSkippedDueToCapacity && <Badge tone="warn">Benzină omisă</Badge>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- day-by-day table ---------- */}
      {visibleDays.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-slate-600">
            Simulare zi-cu-zi (primele {visibleDays.length} din {plan.days.length} zile — exportă Excel pentru tot orizontul)
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-100 scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1.5">Data</th>
                  <th className="px-2 py-1.5 text-right">Stoc inițial benz.</th>
                  <th className="px-2 py-1.5 text-right">Vânzare benz.</th>
                  <th className="px-2 py-1.5 text-right">Înainte de livrare benz.</th>
                  <th className="px-2 py-1.5 text-right">Livrare benz.</th>
                  <th className="px-2 py-1.5 text-right">Stoc final benz.</th>
                  <th className="px-2 py-1.5 text-right">Stoc inițial mot.</th>
                  <th className="px-2 py-1.5 text-right">Vânzare mot.</th>
                  <th className="px-2 py-1.5 text-right">Înainte de livrare mot.</th>
                  <th className="px-2 py-1.5 text-right">Livrare mot.</th>
                  <th className="px-2 py-1.5 text-right">Stoc final mot.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleDays.map((d) => (
                  <DayRow key={d.date} day={d} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- tanker / tank parameters ---------- */}
      <details className="rounded-lg border border-slate-100 p-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-600">Parametri cisternă și rezervoare (editabili)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ParamField label="Compartiment 1 (L)" value={config.compartmentCapacitiesLiters[0]} onBlur={(raw) => patchCompartment(0, raw)} />
          <ParamField label="Compartiment 2 (L)" value={config.compartmentCapacitiesLiters[1]} onBlur={(raw) => patchCompartment(1, raw)} />
          <ParamField label="Compartiment 3 (L)" value={config.compartmentCapacitiesLiters[2]} onBlur={(raw) => patchCompartment(2, raw)} />
          <ParamField label="Compartiment 4 (L, benzină)" value={config.compartmentCapacitiesLiters[3]} onBlur={(raw) => patchCompartment(3, raw)} />
          <ParamField label="Plafon total cisternă (L)" value={config.maxTankerLoadLiters} onBlur={(raw) => patchNumber('maxTankerLoadLiters', raw, { allowNull: false })} />
          <ParamField label="Benzină obligatorie / cursă (L)" value={config.mandatoryBenzinaLoadLiters} onBlur={(raw) => patchNumber('mandatoryBenzinaLoadLiters', raw, { allowNull: false })} />
          <ParamField label="Densitate benzină (kg/L)" value={config.benzinaDensityKgPerLiter} step="0.001" onBlur={(raw) => patchNumber('benzinaDensityKgPerLiter', raw, { allowNull: false })} />
          <ParamField label="Densitate motorină (kg/L)" value={config.motorinaDensityKgPerLiter} step="0.001" onBlur={(raw) => patchNumber('motorinaDensityKgPerLiter', raw, { allowNull: false })} />
          <ParamField label="Capacitate rezervor benzină (tone)" value={config.benzinaTankCapacityTons} onBlur={(raw) => patchNumber('benzinaTankCapacityTons', raw, { allowNull: false })} />
          <ParamField label="Capacitate rezervor motorină (tone)" value={config.motorinaTankCapacityTons} onBlur={(raw) => patchNumber('motorinaTankCapacityTons', raw, { allowNull: false })} />
          <ParamField label="Zile transport (plecare → sosire)" value={config.transitDays} onBlur={(raw) => patchNumber('transitDays', raw, { allowNull: false })} />
          <ParamField label="Orizont plan (zile)" value={config.horizonDays} onBlur={(raw) => patchNumber('horizonDays', raw, { allowNull: false })} />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Capacitatea rezervorului de benzină este de {formatNumber(plan.benzinaTankCapacityLiters ?? 0)} L la densitatea curentă; rezervorul de
          motorină este de {formatNumber(plan.motorinaTankCapacityLiters ?? 0)} L.
        </p>
      </details>
    </div>
  )
}

function AverageBox({ label, avg, onManualChange }: { label: string; avg: AverageResult; onManualChange: (raw: string) => void }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        <Badge tone={avg.source === 'manual' ? 'brand' : avg.source === 'calculat' ? 'good' : 'bad'}>
          {avg.source === 'manual' ? 'manual' : avg.source === 'calculat' ? 'calculat' : 'lipsă'}
        </Badge>
      </div>
      <p className="mb-2 text-base font-semibold text-slate-800">{fmtL(avg.value)}</p>
      {avg.calculatedValue != null && (
        <p className="mb-2 text-[11px] text-slate-400">
          Calculat din vânzări: {fmtL(avg.calculatedValue)} ({avg.dayCount} zile{avg.totalLiters != null ? `, ${fmtL(avg.totalLiters)} total` : ''})
        </p>
      )}
      <input
        type="number"
        step="0.1"
        placeholder="medie manuală (opțional)"
        defaultValue={avg.source === 'manual' ? (avg.value ?? '') : ''}
        onBlur={(e) => onManualChange(e.target.value)}
        className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs"
      />
    </div>
  )
}

function StockBox({
  label,
  liters,
  asOf,
  result,
  onLitersChange,
  onAsOfChange,
}: {
  label: string
  liters: number | null
  asOf: number | null
  result: StockNowResult
  onLitersChange: (raw: string) => void
  onAsOfChange: (ms: number | null) => void
}) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-600">{label}</p>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <input
          type="number"
          placeholder="litri"
          defaultValue={liters ?? ''}
          onBlur={(e) => onLitersChange(e.target.value)}
          className="w-24 rounded border border-slate-200 px-1.5 py-1"
        />
        <input
          type="datetime-local"
          defaultValue={toDatetimeLocalValue(asOf)}
          onBlur={(e) => onAsOfChange(e.target.value ? new Date(e.target.value).getTime() : null)}
          className="rounded border border-slate-200 px-1.5 py-1"
        />
      </div>
      {result.value != null ? (
        <>
          <p className="text-base font-semibold text-slate-800">{fmtL(result.value)} <span className="text-[11px] font-normal text-slate-400">acum</span></p>
          <p className="text-[11px] text-slate-400">
            Raportat {fmtL(result.reportedLiters)} la {fmtTs(result.reportedAsOf)}
            {result.salesSinceReport != null && result.salesSinceReport > 0 ? ` — s-au vândut ${fmtL(result.salesSinceReport)} de atunci` : ''}
          </p>
        </>
      ) : (
        <p className="text-xs text-bad">Introdu stocul și data/ora măsurătorii.</p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function ParamField({ label, value, step, onBlur }: { label: string; value: number; step?: string; onBlur: (raw: string) => void }) {
  return (
    <label className="text-xs">
      <span className="mb-1 block text-slate-500">{label}</span>
      <input
        type="number"
        step={step ?? '1'}
        defaultValue={value}
        onBlur={(e) => onBlur(e.target.value)}
        className="w-full rounded border border-slate-200 px-1.5 py-1"
      />
    </label>
  )
}

function DayRow({ day }: { day: PlanDayRow }) {
  return (
    <tr className={day.isToday ? 'bg-brand-50/40' : undefined}>
      <td className="px-2 py-1.5 whitespace-nowrap">
        {formatDateRo(day.date)}
        {day.isToday && <span className="ml-1 text-[10px] text-brand-600">azi</span>}
      </td>
      <FuelCells fuel={day.benzina} />
      <FuelCells fuel={day.motorina} />
    </tr>
  )
}

function FuelCells({ fuel }: { fuel: PlanDayRow['benzina'] }) {
  return (
    <>
      <td className="px-2 py-1.5 text-right">{fmtL(fuel.stockInitial)}</td>
      <td className="px-2 py-1.5 text-right">{fmtL(fuel.sale)}</td>
      <td className="px-2 py-1.5 text-right text-slate-500">{fmtL(fuel.beforeDelivery)}</td>
      <td className="px-2 py-1.5 text-right">{fuel.deliveryLiters > 0 ? <span className="font-medium text-good">+{fmtL(fuel.deliveryLiters)}</span> : '—'}</td>
      <td className={`px-2 py-1.5 text-right font-medium ${fuel.negative ? 'text-bad' : fuel.overCapacity ? 'text-warn' : 'text-slate-700'}`}>
        {fmtL(fuel.afterDelivery)}
      </td>
    </>
  )
}
