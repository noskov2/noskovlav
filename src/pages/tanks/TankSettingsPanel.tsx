import { useState } from 'react'
import type { TankSettings } from '@/types/domain'
import { emptyTankSettings } from '@/types/domain'
import { FUEL_LABELS } from '@/kpi/tankFuel'
import { classifyFuel } from '@/kpi/tankFuel'

const FIELDS: { key: keyof TankSettings; label: string }[] = [
  { key: 'capacityLiters', label: 'Capacitate (L)' },
  { key: 'minSafetyStockLiters', label: 'Stoc minim siguranță (L)' },
  { key: 'warnDiffLiters', label: 'Prag diferență (L)' },
  { key: 'warnDiffPct', label: 'Prag diferență (%)' },
  { key: 'normalUpdateIntervalMin', label: 'Interval normal actualizare (min)' },
  { key: 'resupplyLeadDays', label: 'Termen reaprovizionare (zile)' },
  { key: 'minOrderQuantity', label: 'Cantitate minimă comandă (L)' },
]

// Shared by TanksPage (where it's the primary, necessary editor — cards and
// forecasts can't compute fill %/reorder qty without it) and SettingsPage
// (a secondary copy, since the owner asked for tank config to live in
// Setări too) — same underlying AppSettings.tankSettings either way.
export function TankSettingsPanel({
  tankIds,
  tankFuelLabels,
  tankSettings,
  onSave,
}: {
  tankIds: string[]
  tankFuelLabels: Record<string, string>
  tankSettings: Record<string, TankSettings>
  onSave: (next: Record<string, TankSettings>) => Promise<void>
}) {
  const [saving, setSaving] = useState<string | null>(null)

  async function setField(tankId: string, key: keyof TankSettings, raw: string) {
    const value = raw.trim() === '' ? null : Number(raw)
    const current = tankSettings[tankId] ?? emptyTankSettings()
    setSaving(tankId + key)
    try {
      await onSave({ ...tankSettings, [tankId]: { ...current, [key]: Number.isFinite(value) ? value : null } })
    } finally {
      setSaving(null)
    }
  }

  if (tankIds.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Niciun rezervor identificat încă — importă întâi o citire FCC sau o mișcare de stoc combustibil.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
      <table className="min-w-full divide-y divide-slate-100 text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-slate-400">
            <th className="px-2 py-1.5">Rezervor</th>
            {FIELDS.map((f) => (
              <th key={f.key} className="px-2 py-1.5">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tankIds.map((tankId) => {
            const cfg = tankSettings[tankId] ?? emptyTankSettings()
            return (
              <tr key={tankId}>
                <td className="px-2 py-1.5 font-medium text-slate-700">
                  {tankId} — {tankFuelLabels[tankId] ?? FUEL_LABELS[classifyFuel(tankId)]}
                </td>
                {FIELDS.map((f) => (
                  <td key={f.key} className="px-2 py-1.5">
                    <input
                      type="number"
                      defaultValue={cfg[f.key] ?? ''}
                      onBlur={(e) => setField(tankId, f.key, e.target.value)}
                      disabled={saving === tankId + f.key}
                      className="w-28 rounded border border-slate-200 px-1.5 py-1 text-xs"
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
