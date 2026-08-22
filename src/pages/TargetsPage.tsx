import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useDataStore } from '@/store/dataStore'
import { getSettings, saveMonthTargets } from '@/data/repo/settings'
import { emptyMonthTargets, emptyTargetSet, type MonthTargets, type TargetSet } from '@/types/domain'
import { todayStr, monthLabel } from '@/kpi/dateRanges'

const METRIC_FIELDS: { key: keyof TargetSet; label: string; suffix: string }[] = [
  { key: 'totalSales', label: 'Vânzări totale', suffix: 'lei' },
  { key: 'goodsSales', label: 'Marfă', suffix: 'lei' },
  { key: 'gplValue', label: 'GPL', suffix: 'lei' },
  { key: 'crossSellPct', label: 'Cross-sell', suffix: '%' },
  { key: 'coffeeCount', label: 'Cafele', suffix: 'buc' },
  { key: 'sandwichCount', label: 'Sandwich-uri', suffix: 'buc' },
  { key: 'grossProfit', label: 'Profit brut', suffix: 'lei' },
  { key: 'avgReceiptValue', label: 'Bon mediu', suffix: 'lei' },
]

function monthKeyOptions(): { key: string; label: string }[] {
  const today = todayStr()
  const [y, m] = today.split('-').map(Number)
  const options: { key: string; label: string }[] = []
  for (let i = -2; i <= 1; i++) {
    const d = new Date(y, m - 1 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({ key, label: monthLabel(`${key}-01`) })
  }
  return options
}

export function TargetsPage() {
  const { teams, refresh } = useDataStore()
  const options = monthKeyOptions()
  const [monthKey, setMonthKey] = useState(options[2].key) // current month
  const [targets, setTargets] = useState<MonthTargets>(emptyMonthTargets())
  const [saved, setSaved] = useState(false)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = loadedFor !== monthKey

  useEffect(() => {
    let cancelled = false
    getSettings().then((s) => {
      if (cancelled) return
      setTargets(s.monthlyTargets[monthKey] ?? emptyMonthTargets())
      setLoadedFor(monthKey)
    })
    return () => {
      cancelled = true
    }
  }, [monthKey])

  function setStationField(key: keyof TargetSet, value: number | null) {
    setTargets((t) => ({ ...t, station: { ...t.station, [key]: value } }))
  }

  function setTeamField(teamId: string, key: keyof TargetSet, value: number | null) {
    setTargets((t) => ({
      ...t,
      byTeam: { ...t.byTeam, [teamId]: { ...(t.byTeam[teamId] ?? emptyTargetSet()), [key]: value } },
    }))
  }

  async function save() {
    await saveMonthTargets(monthKey, targets)
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <PageHeader
        title="Targeturi"
        description="Targeturi lunare pentru stație și pentru fiecare echipă — folosite pe Dashboard pentru forecast și „pace to target”."
      />

      <div className="mb-5 flex items-center gap-2">
        <span className="text-sm text-slate-500">Luna:</span>
        <select
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Se încarcă...</p>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Target stație</h3>
            <TargetGrid value={targets.station} onChange={setStationField} />
          </div>

          {teams.length === 0 ? (
            <p className="mb-5 text-sm text-slate-400">Nicio echipă configurată — vezi Nomenclator → Casieri.</p>
          ) : (
            teams.map((team) => (
              <div key={team.id} className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Target echipă — {team.name}</h3>
                <TargetGrid
                  value={targets.byTeam[team.id] ?? emptyTargetSet()}
                  onChange={(key, value) => setTeamField(team.id, key, value)}
                />
              </div>
            ))
          )}

          <div className="flex items-center gap-3">
            <button onClick={save} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
              Salvează targeturile
            </button>
            {saved && <span className="text-sm text-good">Salvat.</span>}
          </div>
        </>
      )}
    </div>
  )
}

function TargetGrid({
  value,
  onChange,
}: {
  value: TargetSet
  onChange: (key: keyof TargetSet, value: number | null) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {METRIC_FIELDS.map((f) => (
        <label key={f.key} className="text-xs text-slate-600">
          <span className="mb-1 block font-medium">{f.label}</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.01"
              value={value[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value === '' ? null : Number(e.target.value))}
              placeholder="fără target"
              className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
            <span className="text-slate-400">{f.suffix}</span>
          </div>
        </label>
      ))}
    </div>
  )
}
