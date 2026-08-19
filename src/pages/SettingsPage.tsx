import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { getSettings, updateSettings } from '@/data/repo/settings'
import { recomputeAllShifts } from '@/data/repo/transactions'
import { useDataStore } from '@/store/dataStore'
import { defaultShiftConfig, type PurchaseColumnMapping, type SalesColumnMapping, type ShiftConfig } from '@/types/domain'
import { formatNumber } from '@/lib/format'

export function SettingsPage() {
  const { refresh, transactions, importBatches } = useDataStore()
  const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(defaultShiftConfig)
  const [saved, setSaved] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)
  const [salesMapping, setSalesMapping] = useState<SalesColumnMapping | null>(null)
  const [purchaseMapping, setPurchaseMapping] = useState<PurchaseColumnMapping | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      setShiftConfig(s.shiftConfig)
      setSalesMapping(s.salesMapping)
      setPurchaseMapping(s.purchaseMapping)
    })
  }, [])

  async function saveShifts() {
    await updateSettings({ shiftConfig })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function recompute() {
    setRecomputing(true)
    setRecomputeMsg(null)
    const count = await recomputeAllShifts(shiftConfig)
    await refresh()
    setRecomputeMsg(`${formatNumber(count)} tranzacții recalculate cu noile ore de tură.`)
    setRecomputing(false)
  }

  return (
    <div>
      <PageHeader title="Setări" description="Ture, mapare coloane și informații despre stocarea datelor." />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Ture</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ShiftRow
            label="Tura 1"
            start={shiftConfig.shift1Start}
            end={shiftConfig.shift1End}
            onChange={(start, end) => setShiftConfig((c) => ({ ...c, shift1Start: start, shift1End: end }))}
          />
          <ShiftRow
            label="Tura 2"
            start={shiftConfig.shift2Start}
            end={shiftConfig.shift2End}
            onChange={(start, end) => setShiftConfig((c) => ({ ...c, shift2Start: start, shift2End: end }))}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={saveShifts} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
            Salvează
          </button>
          {saved && <span className="text-sm text-good">Salvat.</span>}
          <button
            onClick={recompute}
            disabled={recomputing || transactions.length === 0}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {recomputing ? 'Se recalculează...' : 'Recalculează turele pentru toate tranzacțiile importate'}
          </button>
          {recomputeMsg && <span className="text-sm text-slate-500">{recomputeMsg}</span>}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Mapare coloane salvată</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <MappingSummary title="Vânzări / tranzacții" mapping={salesMapping} />
          <MappingSummary title="Achiziții / Furnizori" mapping={purchaseMapping} />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Maparea se actualizează automat data viitoare când imporți un fișier și confirmi coloanele. Pentru a o
          reseta, elimină-o mai jos și va fi re-ghicită la următorul import.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={async () => {
              await updateSettings({ salesMapping: null })
              setSalesMapping(null)
            }}
            className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Resetează maparea vânzărilor
          </button>
          <button
            onClick={async () => {
              await updateSettings({ purchaseMapping: null })
              setPurchaseMapping(null)
            }}
            className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Resetează maparea achizițiilor
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Despre stocarea datelor</h3>
        <p className="text-sm text-slate-500">
          Toate datele ({formatNumber(transactions.length)} linii de tranzacții, {formatNumber(importBatches.length)}{' '}
          importuri) sunt salvate local, în IndexedDB, în acest browser. Ele rămân disponibile după refresh, dar sunt
          specifice acestui dispozitiv/browser — nu sunt sincronizate automat pe alt calculator. Structura aplicației
          separă clar importul, procesarea și calculul KPI de stocare, astfel încât acest strat poate fi înlocuit
          ulterior cu un backend/bază de date server, fără a schimba restul aplicației.
        </p>
      </div>
    </div>
  )
}

function ShiftRow({
  label,
  start,
  end,
  onChange,
}: {
  label: string
  start: string
  end: string
  onChange: (start: string, end: string) => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600">{label}</p>
      <div className="flex items-center gap-2">
        <input type="time" value={start} onChange={(e) => onChange(e.target.value, end)} className="rounded border border-slate-200 px-2 py-1 text-sm" />
        <span className="text-slate-400">–</span>
        <input type="time" value={end} onChange={(e) => onChange(start, e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-sm" />
      </div>
    </div>
  )
}

function MappingSummary({
  title,
  mapping,
}: {
  title: string
  mapping: SalesColumnMapping | PurchaseColumnMapping | null
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-600">{title}</p>
      {!mapping ? (
        <p className="text-sm text-slate-400">Nesalvată încă — se configurează la primul import.</p>
      ) : (
        <ul className="space-y-0.5 text-xs text-slate-500">
          {Object.entries(mapping).map(([field, col]) => (
            <li key={field} className="flex justify-between gap-2">
              <span className="capitalize">{field}</span>
              <span className="font-medium text-slate-700">{col ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
