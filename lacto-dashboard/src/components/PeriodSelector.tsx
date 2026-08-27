import { useState } from 'react'
import {
  COMPARISON_MODES,
  PERIOD_PRESETS,
  formatPeriodLabel,
  resolveComparisonPeriod,
  resolvePeriod,
} from '../lib/periods'
import type { ComparisonMode, DateRange, PeriodPreset } from '../lib/periods'

interface Props {
  period: DateRange
  comparisonMode: ComparisonMode
  comparisonPeriod: DateRange | null
  onChange: (patch: { period?: DateRange; comparisonMode?: ComparisonMode; comparisonPeriod?: DateRange | null }) => void
}

export function PeriodSelector({ period, comparisonMode, comparisonPeriod, onChange }: Props) {
  const [preset, setPreset] = useState<PeriodPreset>('current-month')
  const [customPeriod, setCustomPeriod] = useState<DateRange>(period)
  const [customComparison, setCustomComparison] = useState<DateRange>(comparisonPeriod ?? period)

  function handlePresetChange(next: PeriodPreset) {
    setPreset(next)
    if (next === 'custom') return
    const nextPeriod = resolvePeriod(next)
    onChange({ period: nextPeriod, comparisonPeriod: resolveComparisonPeriod(nextPeriod, comparisonMode) })
  }

  function handleCustomPeriodChange(next: DateRange) {
    setCustomPeriod(next)
    onChange({ period: next, comparisonPeriod: resolveComparisonPeriod(next, comparisonMode) })
  }

  function handleComparisonModeChange(next: ComparisonMode) {
    onChange({ comparisonMode: next, comparisonPeriod: resolveComparisonPeriod(period, next, customComparison) })
  }

  function handleCustomComparisonChange(next: DateRange) {
    setCustomComparison(next)
    onChange({ comparisonPeriod: next })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">Perioadă</label>
        <select
          className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
        >
          {PERIOD_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {preset === 'custom' && (
        <>
          <DateInput label="De la" value={customPeriod.start} onChange={(v) => handleCustomPeriodChange({ ...customPeriod, start: v })} />
          <DateInput label="Până la" value={customPeriod.end} onChange={(v) => handleCustomPeriodChange({ ...customPeriod, end: v })} />
        </>
      )}

      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1">Compară cu</label>
        <select
          className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
          value={comparisonMode}
          onChange={(e) => handleComparisonModeChange(e.target.value as ComparisonMode)}
        >
          {COMPARISON_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {comparisonMode === 'custom' && (
        <>
          <DateInput label="De la" value={customComparison.start} onChange={(v) => handleCustomComparisonChange({ ...customComparison, start: v })} />
          <DateInput label="Până la" value={customComparison.end} onChange={(v) => handleCustomComparisonChange({ ...customComparison, end: v })} />
        </>
      )}

      <div className="text-xs text-slate-500 pb-1.5">
        <div>{formatPeriodLabel(period)}</div>
        {comparisonPeriod && <div className="text-slate-400">vs. {formatPeriodLabel(comparisonPeriod)}</div>}
      </div>
    </div>
  )
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 block mb-1">{label}</label>
      <input
        type="date"
        className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
