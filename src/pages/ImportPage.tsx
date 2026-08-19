import { useRef, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { parseExcelFile, type ParsedSheet } from '@/import/excelParser'
import {
  guessPurchaseMapping,
  guessSalesMapping,
  isPurchaseMappingComplete,
  isSalesMappingComplete,
} from '@/import/columnMapping'
import { importSalesSheet } from '@/import/importTransactions'
import { importPurchaseSheet } from '@/import/importPurchases'
import { getSettings, updateSettings } from '@/data/repo/settings'
import { useDataStore } from '@/store/dataStore'
import { formatDateRo, formatNumber } from '@/lib/format'
import type { PurchaseColumnMapping, SalesColumnMapping } from '@/types/domain'

type ImportKind = 'sales' | 'purchases'

const SALES_FIELDS: { key: keyof SalesColumnMapping; label: string; required: boolean }[] = [
  { key: 'cashier', label: 'Casier', required: true },
  { key: 'datetime', label: 'Data + Ora (o singură coloană)', required: false },
  { key: 'date', label: 'Data (dacă e separată de oră)', required: false },
  { key: 'time', label: 'Ora (dacă e separată de dată)', required: false },
  { key: 'receiptNo', label: 'Număr bon', required: true },
  { key: 'product', label: 'Produs', required: true },
  { key: 'category', label: 'Categorie', required: false },
  { key: 'quantity', label: 'Cantitate', required: true },
  { key: 'value', label: 'Valoare (vânzare)', required: true },
  { key: 'valueNoVat', label: 'Valoare fără TVA', required: false },
  { key: 'purchasePrice', label: 'Preț achiziție (unitar)', required: false },
]

const PURCHASE_FIELDS: { key: keyof PurchaseColumnMapping; label: string; required: boolean }[] = [
  { key: 'product', label: 'Produs', required: true },
  { key: 'supplier', label: 'Furnizor', required: true },
  { key: 'date', label: 'Data recepției', required: true },
  { key: 'quantity', label: 'Cantitate', required: true },
  { key: 'price', label: 'Preț achiziție', required: true },
]

export function ImportPage() {
  const { refresh, importBatches } = useDataStore()
  const [kind, setKind] = useState<ImportKind>('sales')
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [salesMapping, setSalesMapping] = useState<SalesColumnMapping | null>(null)
  const [purchaseMapping, setPurchaseMapping] = useState<PurchaseColumnMapping | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(f: File) {
    setError(null)
    setStatus(null)
    setFile(f)
    try {
      const parsed = await parseExcelFile(f)
      if (parsed.rows.length === 0) {
        setError('Fișierul nu conține rânduri de date.')
        return
      }
      setSheet(parsed)
      const settings = await getSettings()
      if (kind === 'sales') {
        setSalesMapping(settings.salesMapping && sameHeaders(settings.salesMapping, parsed.headers)
          ? settings.salesMapping
          : guessSalesMapping(parsed.headers))
      } else {
        setPurchaseMapping(
          settings.purchaseMapping && sameHeadersPurchase(settings.purchaseMapping, parsed.headers)
            ? settings.purchaseMapping
            : guessPurchaseMapping(parsed.headers),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la citirea fișierului.')
    }
  }

  function sameHeaders(mapping: SalesColumnMapping, headers: string[]): boolean {
    const values = Object.values(mapping).filter((v): v is string => !!v)
    return values.every((v) => headers.includes(v))
  }
  function sameHeadersPurchase(mapping: PurchaseColumnMapping, headers: string[]): boolean {
    return Object.values(mapping).every((v) => headers.includes(v))
  }

  async function runImport() {
    if (!file || !sheet) return
    setBusy(true)
    setError(null)
    try {
      if (kind === 'sales') {
        if (!salesMapping || !isSalesMappingComplete(salesMapping)) {
          setError('Completează toate câmpurile obligatorii din mapare înainte de import.')
          setBusy(false)
          return
        }
        const settings = await getSettings()
        await updateSettings({ salesMapping })
        const result = await importSalesSheet(file.name, sheet, salesMapping, settings.shiftConfig)
        setStatus(
          `Import finalizat: ${formatNumber(result.rowCount)} linii importate` +
            (result.skippedRows > 0 ? `, ${formatNumber(result.skippedRows)} rânduri ignorate (fără produs/dată).` : '.') +
            (result.dateMin && result.dateMax ? ` Interval: ${formatDateRo(result.dateMin)} – ${formatDateRo(result.dateMax)}.` : ''),
        )
      } else {
        if (!purchaseMapping || !isPurchaseMappingComplete(purchaseMapping)) {
          setError('Completează toate câmpurile obligatorii din mapare înainte de import.')
          setBusy(false)
          return
        }
        await updateSettings({ purchaseMapping })
        const result = await importPurchaseSheet(file.name, sheet, purchaseMapping)
        setStatus(
          `Import finalizat: ${formatNumber(result.rowCount)} linii de achiziție importate` +
            (result.skippedRows > 0 ? `, ${formatNumber(result.skippedRows)} rânduri ignorate.` : '.'),
        )
      }
      await refresh()
      setFile(null)
      setSheet(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la import.')
    } finally {
      setBusy(false)
    }
  }

  const mappingComplete =
    kind === 'sales' ? !!salesMapping && isSalesMappingComplete(salesMapping) : !!purchaseMapping && isPurchaseMappingComplete(purchaseMapping)

  return (
    <div>
      <PageHeader
        title="Import date"
        description="Încarcă periodic exporturile Excel din softul stației. Configurația de mapare coloane se salvează automat."
      />

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => {
            setKind('sales')
            setSheet(null)
            setFile(null)
          }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === 'sales' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Vânzări / tranzacții
        </button>
        <button
          onClick={() => {
            setKind('purchases')
            setSheet(null)
            setFile(null)
          }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === 'purchases' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          Achiziții / Furnizori
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 px-6 py-10 text-center hover:border-brand-300 hover:bg-brand-50/40">
          <span className="text-3xl">📄</span>
          <span className="mt-2 text-sm font-medium text-slate-700">
            {file ? file.name : 'Alege un fișier Excel (.xlsx, .xls, .csv)'}
          </span>
          <span className="mt-1 text-xs text-slate-400">Click pentru a selecta fișierul</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </label>

        {error && <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {status && <p className="mt-3 rounded-lg bg-good/10 px-3 py-2 text-sm text-good">{status}</p>}

        {sheet && (
          <div className="mt-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Mapare coloane</h3>
            <p className="mb-3 text-xs text-slate-500">
              Fișierul are {formatNumber(sheet.rows.length)} rânduri. Spune aplicației ce reprezintă fiecare coloană —
              maparea se ține minte pentru importurile viitoare cu aceleași denumiri de coloane.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {kind === 'sales'
                ? SALES_FIELDS.map((f) => (
                    <MappingField
                      key={f.key}
                      label={f.label}
                      required={f.required}
                      headers={sheet.headers}
                      value={salesMapping?.[f.key] ?? ''}
                      onChange={(v) =>
                        setSalesMapping((m) => (m ? { ...m, [f.key]: v || null } : m))
                      }
                    />
                  ))
                : PURCHASE_FIELDS.map((f) => (
                    <MappingField
                      key={f.key}
                      label={f.label}
                      required={f.required}
                      headers={sheet.headers}
                      value={purchaseMapping?.[f.key] ?? ''}
                      onChange={(v) =>
                        setPurchaseMapping((m) => (m ? { ...m, [f.key]: v } : m))
                      }
                    />
                  ))}
            </div>

            <button
              onClick={runImport}
              disabled={!mappingComplete || busy}
              className="mt-5 rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Se importă...' : 'Importă datele'}
            </button>
          </div>
        )}
      </div>

      {importBatches.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Istoric importuri</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1.5">Fișier</th>
                  <th className="px-2 py-1.5">Tip</th>
                  <th className="px-2 py-1.5">Importat la</th>
                  <th className="px-2 py-1.5 text-right">Rânduri</th>
                  <th className="px-2 py-1.5">Interval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {importBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-2 py-1.5">{b.filename}</td>
                    <td className="px-2 py-1.5">{b.kind === 'sales' ? 'Vânzări' : 'Achiziții'}</td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {new Date(b.importedAt).toLocaleString('ro-RO')}
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(b.rowCount)}</td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {b.dateMin && b.dateMax ? `${formatDateRo(b.dateMin)} – ${formatDateRo(b.dateMax)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MappingField({
  label,
  required,
  headers,
  value,
  onChange,
}: {
  label: string
  required: boolean
  headers: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label} {required && <span className="text-bad">*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md border px-2 py-1.5 text-sm ${
          required && !value ? 'border-bad/40 bg-bad/5' : 'border-slate-200'
        }`}
      >
        <option value="">— nemapat —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  )
}
