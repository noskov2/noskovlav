import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { getSettings, updateSettings } from '@/data/repo/settings'
import { recomputeAllShifts } from '@/data/repo/transactions'
import { determineShift } from '@/processing/shift'
import { downloadBackup, restoreBackup, validateBackup, type BackupData, type BackupValidation } from '@/data/backup'
import { useDataStore } from '@/store/dataStore'
import {
  defaultShiftConfig,
  type PurchaseColumnMapping,
  type SalesColumnMapping,
  type ShiftConfig,
  type StockColumnMapping,
} from '@/types/domain'
import { formatNumber } from '@/lib/format'

export function SettingsPage() {
  const { refresh, transactions, importBatches } = useDataStore()
  const [backingUp, setBackingUp] = useState(false)
  const [restoreFile, setRestoreFile] = useState<{ data: BackupData; validation: BackupValidation } | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreConfirmStep, setRestoreConfirmStep] = useState(false)
  const restoreInputRef = useRef<HTMLInputElement>(null)
  const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(defaultShiftConfig)
  const [saved, setSaved] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)
  const [salesMapping, setSalesMapping] = useState<SalesColumnMapping | null>(null)
  const [purchaseMapping, setPurchaseMapping] = useState<PurchaseColumnMapping | null>(null)
  const [stockMapping, setStockMapping] = useState<StockColumnMapping | null>(null)
  const [vatRate, setVatRate] = useState(19)
  const [vatSaved, setVatSaved] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setShiftConfig(s.shiftConfig)
      setSalesMapping(s.salesMapping)
      setPurchaseMapping(s.purchaseMapping)
      setStockMapping(s.stockMapping)
      setVatRate(s.defaultVatRatePct)
    })
  }, [])

  // How many stored transactions would actually change shift under the
  // currently-edited (not-yet-saved) hours — derived straight from render
  // inputs, so the warning below is concrete, not abstract, with no extra
  // effect/state round-trip needed.
  const shiftPreview = useMemo(() => {
    if (transactions.length === 0) return null
    let changed = 0
    for (const t of transactions) {
      if (determineShift(t.time, shiftConfig) !== t.shift) changed++
    }
    return changed
  }, [shiftConfig, transactions])

  async function saveVatRate() {
    await updateSettings({ defaultVatRatePct: vatRate })
    setVatSaved(true)
    setTimeout(() => setVatSaved(false), 2000)
  }

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

  async function doBackup() {
    setBackingUp(true)
    try {
      await downloadBackup()
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestoreFile(file: File) {
    setRestoreError(null)
    setRestoreFile(null)
    setRestoreConfirmStep(false)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const validation = validateBackup(parsed)
      if (!validation.valid) {
        setRestoreError(`Fișierul nu pare un backup valid: ${validation.errors.join(' ')}`)
        return
      }
      setRestoreFile({ data: parsed as BackupData, validation })
    } catch {
      setRestoreError('Fișierul nu a putut fi citit ca JSON valid.')
    }
  }

  async function confirmRestore() {
    if (!restoreFile) return
    setRestoring(true)
    try {
      await restoreBackup(restoreFile.data)
      await refresh()
      setRestoreFile(null)
      setRestoreConfirmStep(false)
      if (restoreInputRef.current) restoreInputRef.current.value = ''
    } finally {
      setRestoring(false)
    }
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
        {shiftPreview != null && shiftPreview > 0 && (
          <p className="mt-3 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
            Cu aceste ore, {formatNumber(shiftPreview)} din {formatNumber(transactions.length)} tranzacții deja
            importate și-ar schimba tura. Apasă „Recalculează" ca să le actualizezi — până atunci rămân la turele
            calculate cu orele vechi.
          </p>
        )}
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
        <h3 className="mb-1 text-sm font-semibold text-slate-700">TVA implicit</h3>
        <p className="mb-3 text-xs text-slate-500">
          Folosit pentru a calcula valoarea fără TVA (deci profitul și marja) atunci când fișierul importat nu are
          coloană „Valoare fără TVA" și produsul nu are un TVA propriu setat în Nomenclator.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={vatRate}
            onChange={(e) => setVatRate(Number(e.target.value))}
            className="w-24 rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-slate-500">%</span>
          <button onClick={saveVatRate} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
            Salvează
          </button>
          {vatSaved && <span className="text-sm text-good">Salvat.</span>}
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Mapare coloane salvată</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <MappingSummary title="Vânzări / tranzacții" mapping={salesMapping} />
          <MappingSummary title="Achiziții / Furnizori" mapping={purchaseMapping} />
          <MappingSummary title="Stoc curent" mapping={stockMapping} />
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
          <button
            onClick={async () => {
              await updateSettings({ stockMapping: null })
              setStockMapping(null)
            }}
            className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Resetează maparea stocului
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Backup & Restaurare</h3>
        <p className="mb-3 text-xs text-slate-500">
          Aplicația e 100% locală — datele există doar în acest browser. Descarcă un backup periodic; dacă golești
          datele browserului sau treci pe alt calculator, îl poți restaura de aici.
        </p>
        <button
          onClick={doBackup}
          disabled={backingUp}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {backingUp ? 'Se pregătește...' : 'Descarcă backup (.json)'}
        </button>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <label className="flex cursor-pointer flex-col items-start gap-1">
            <span className="text-xs font-semibold text-slate-700">Restaurează dintr-un backup</span>
            <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              Alege fișier .json
            </span>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleRestoreFile(f)
              }}
            />
          </label>

          {restoreError && <p className="mt-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{restoreError}</p>}

          {restoreFile?.validation.summary && (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3">
              <p className="text-sm text-warn">
                Acest backup conține {formatNumber(restoreFile.validation.summary.transactions)} tranzacții,{' '}
                {formatNumber(restoreFile.validation.summary.products)} produse,{' '}
                {formatNumber(restoreFile.validation.summary.importBatches)} importuri
                {restoreFile.validation.summary.exportedAt
                  ? ` (exportat la ${new Date(restoreFile.validation.summary.exportedAt).toLocaleString('ro-RO')})`
                  : ''}
                .
              </p>
              <p className="mt-1.5 text-sm font-medium text-bad">
                Restaurarea ÎNLOCUIEȘTE complet datele curente din acest browser ({formatNumber(transactions.length)}{' '}
                tranzacții, {formatNumber(importBatches.length)} importuri) — acțiunea nu poate fi anulată.
              </p>
              {!restoreConfirmStep ? (
                <button
                  onClick={() => setRestoreConfirmStep(true)}
                  className="mt-2 rounded-lg border border-bad px-3 py-1.5 text-sm font-medium text-bad hover:bg-bad/10"
                >
                  Continuă spre restaurare
                </button>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={confirmRestore}
                    disabled={restoring}
                    className="rounded-lg bg-bad px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {restoring ? 'Se restaurează...' : 'Da, înlocuiește datele cu acest backup'}
                  </button>
                  <button
                    onClick={() => {
                      setRestoreConfirmStep(false)
                      setRestoreFile(null)
                      if (restoreInputRef.current) restoreInputRef.current.value = ''
                    }}
                    disabled={restoring}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
                  >
                    Anulează
                  </button>
                </div>
              )}
            </div>
          )}
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
  mapping: SalesColumnMapping | PurchaseColumnMapping | StockColumnMapping | null
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
