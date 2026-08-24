import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { parseExcelFile, type ParsedSheet } from '@/import/excelParser'
import {
  guessPurchaseMapping,
  guessSalesMapping,
  guessStockMapping,
  isPurchaseMappingComplete,
  isSalesMappingComplete,
  isStockMappingComplete,
} from '@/import/columnMapping'
import { importSalesSheet } from '@/import/importTransactions'
import { importPurchaseSheet } from '@/import/importPurchases'
import { importStockSheet } from '@/import/importStock'
import { deleteImportBatchData } from '@/import/deleteImport'
import { getSettings, updateSettings } from '@/data/repo/settings'
import { useDataStore } from '@/store/dataStore'
import { formatDateRo, formatNumber } from '@/lib/format'
import type { ImportKind, PurchaseColumnMapping, SalesColumnMapping, StockColumnMapping } from '@/types/domain'

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
  { key: 'promotion', label: 'Promoție (ce promoție este, dacă e cazul)', required: false },
]

const PURCHASE_FIELDS: { key: keyof PurchaseColumnMapping; label: string; required: boolean }[] = [
  { key: 'product', label: 'Produs', required: true },
  { key: 'supplier', label: 'Furnizor', required: true },
  { key: 'date', label: 'Data recepției', required: true },
  { key: 'quantity', label: 'Cantitate', required: true },
  { key: 'price', label: 'Preț achiziție', required: true },
]

const STOCK_FIELDS: { key: keyof StockColumnMapping; label: string; required: boolean }[] = [
  { key: 'product', label: 'Produs', required: true },
  { key: 'quantity', label: 'Stoc curent', required: true },
  { key: 'salePrice', label: 'Preț vânzare', required: false },
  { key: 'category', label: 'Categorie (actualizează categoria produsului)', required: false },
]

const KIND_LABELS: Record<ImportKind, string> = {
  sales: 'Vânzări',
  purchases: 'Achiziții',
  stock: 'Stoc',
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
}

// Reuses a saved mapping when this file's headers are the "same" allowing
// for trivial case/whitespace differences a POS export can introduce
// between runs (e.g. "Valoare fara TVA" vs "Valoare fara tva") — remapping
// each field to the header string as it actually appears in THIS file,
// rather than requiring an exact match and silently falling back to a
// fresh guess (which can be much worse — e.g. missing the real date column
// entirely) just because one column's capitalization changed.
function reconcileMapping<M extends object>(mapping: M, headers: string[]): M | null {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]))
  const result = { ...mapping } as Record<string, unknown>
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value !== 'string' || !value) continue
    const match = byNormalized.get(normalizeHeader(value))
    if (!match) return null
    result[key] = match
  }
  return result as M
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function nowDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nowTime(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ImportPage() {
  const { refresh, importBatches } = useDataStore()
  const [searchParams] = useSearchParams()
  const [kind, setKind] = useState<ImportKind>(() => {
    const requested = searchParams.get('kind')
    return requested === 'sales' || requested === 'purchases' || requested === 'stock' ? requested : 'sales'
  })
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [salesMapping, setSalesMapping] = useState<SalesColumnMapping | null>(null)
  const [purchaseMapping, setPurchaseMapping] = useState<PurchaseColumnMapping | null>(null)
  const [stockMapping, setStockMapping] = useState<StockColumnMapping | null>(null)
  const [asOfDate, setAsOfDate] = useState(nowDate())
  const [asOfTime, setAsOfTime] = useState(nowTime())
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleDelete(batch: (typeof importBatches)[number]) {
    setDeletingId(batch.id)
    try {
      await deleteImportBatchData(batch)
      await refresh()
    } finally {
      setDeletingId(null)
      setPendingDeleteId(null)
    }
  }

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
        const reconciled = settings.salesMapping && reconcileMapping(settings.salesMapping, parsed.headers)
        setSalesMapping(reconciled ?? guessSalesMapping(parsed.headers))
      } else if (kind === 'purchases') {
        const reconciled = settings.purchaseMapping && reconcileMapping(settings.purchaseMapping, parsed.headers)
        setPurchaseMapping(reconciled ?? guessPurchaseMapping(parsed.headers))
      } else {
        const reconciled = settings.stockMapping && reconcileMapping(settings.stockMapping, parsed.headers)
        setStockMapping(reconciled ?? guessStockMapping(parsed.headers))
        setAsOfDate(nowDate())
        setAsOfTime(nowTime())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la citirea fișierului.')
    }
  }

  async function runImport() {
    if (!file || !sheet) return
    setBusy(true)
    setError(null)
    let keepMappingForRetry = false
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
        const bits = [`${formatNumber(result.rowCount)} linii noi importate`]
        if (result.duplicateRowCount > 0) bits.push(`${formatNumber(result.duplicateRowCount)} duplicate ignorate`)
        if (result.invalidRowCount > 0) bits.push(`${formatNumber(result.invalidRowCount)} rânduri invalide excluse`)
        if (result.skippedRows > 0) bits.push(`${formatNumber(result.skippedRows)} rânduri ignorate (fără produs/dată)`)
        if (result.newProductCount > 0) bits.push(`${formatNumber(result.newProductCount)} produse noi`)
        if (result.newCashierCount > 0) bits.push(`${formatNumber(result.newCashierCount)} casieri noi`)
        // Aproape toate rândurile ignorate, cu 0 linii importate, aproape
        // sigur înseamnă că maparea de dată (sau produs) e greșită, nu că
        // fișierul chiar n-are date de importat — un mesaj verde neutru
        // ("Import finalizat") ar ascunde exact ce trebuie verificat.
        if (result.rowCount === 0 && result.skippedRows > sheet.rows.length * 0.5) {
          keepMappingForRetry = true
          setError(
            `Niciun rând nu a putut fi importat — ${formatNumber(result.skippedRows)} din ${formatNumber(sheet.rows.length)} rânduri nu au produs sau dată recunoscute. Verifică maparea coloanelor „Data + Ora" / „Data" mai sus — probabil coloana selectată nu conține o dată validă.`,
          )
        } else {
          setStatus(
            `Import finalizat: ${bits.join(', ')}.` +
              (result.dateMin && result.dateMax ? ` Interval: ${formatDateRo(result.dateMin)} – ${formatDateRo(result.dateMax)}.` : ''),
          )
        }
      } else if (kind === 'purchases') {
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
      } else {
        if (!stockMapping || !isStockMappingComplete(stockMapping)) {
          setError('Completează toate câmpurile obligatorii din mapare înainte de import.')
          setBusy(false)
          return
        }
        if (!asOfDate) {
          setError('Alege data la care este valabil acest stoc.')
          setBusy(false)
          return
        }
        await updateSettings({ stockMapping })
        const asOf = new Date(`${asOfDate}T${asOfTime || '00:00'}:00`).getTime()
        const result = await importStockSheet(file.name, sheet, stockMapping, asOf)
        setStatus(
          `Import finalizat: ${formatNumber(result.rowCount)} produse cu stoc valabil la ${formatDateRo(asOfDate)} ${asOfTime}` +
            (result.skippedRows > 0 ? `, ${formatNumber(result.skippedRows)} rânduri ignorate.` : '.'),
        )
      }
      await refresh()
      if (!keepMappingForRetry) {
        setFile(null)
        setSheet(null)
        if (inputRef.current) inputRef.current.value = ''
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eroare la import.')
    } finally {
      setBusy(false)
    }
  }

  const mappingComplete =
    kind === 'sales'
      ? !!salesMapping && isSalesMappingComplete(salesMapping)
      : kind === 'purchases'
        ? !!purchaseMapping && isPurchaseMappingComplete(purchaseMapping)
        : !!stockMapping && isStockMappingComplete(stockMapping) && !!asOfDate

  return (
    <div>
      <PageHeader
        title="Import date"
        description="Încarcă periodic exporturile Excel din softul stației. Configurația de mapare coloane se salvează automat."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {(['sales', 'purchases', 'stock'] as ImportKind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k)
              setSheet(null)
              setFile(null)
              setError(null)
              setStatus(null)
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${kind === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {k === 'sales' ? 'Vânzări / tranzacții' : k === 'purchases' ? 'Achiziții / Furnizori' : 'Stoc curent'}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {kind === 'stock' && (
          <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
            Încarcă un Excel cu stocul curent al produselor (și, dacă vrei, prețul de vânzare). Fiecare încărcare
            este o „poză” a stocului — spune-i aplicației exact la ce dată și oră este valabilă, ca să nu se
            amestece cu alte încărcări în calcule.
          </p>
        )}

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
            {kind === 'stock' && (
              <div className="mb-5 rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Acest stoc este valabil la:</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="time"
                    value={asOfTime}
                    onChange={(e) => setAsOfTime(e.target.value)}
                    className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}

            <h3 className="mb-1 text-sm font-semibold text-slate-800">Mapare coloane</h3>
            <p className="mb-3 text-xs text-slate-500">
              Fișierul are {formatNumber(sheet.rows.length)} rânduri. Spune aplicației ce reprezintă fiecare coloană —
              maparea se ține minte pentru importurile viitoare cu aceleași denumiri de coloane.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {kind === 'sales' &&
                SALES_FIELDS.map((f) => (
                  <MappingField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    headers={sheet.headers}
                    value={salesMapping?.[f.key] ?? ''}
                    onChange={(v) => setSalesMapping((m) => (m ? { ...m, [f.key]: v || null } : m))}
                  />
                ))}
              {kind === 'purchases' &&
                PURCHASE_FIELDS.map((f) => (
                  <MappingField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    headers={sheet.headers}
                    value={purchaseMapping?.[f.key] ?? ''}
                    onChange={(v) => setPurchaseMapping((m) => (m ? { ...m, [f.key]: v } : m))}
                  />
                ))}
              {kind === 'stock' &&
                STOCK_FIELDS.map((f) => (
                  <MappingField
                    key={f.key}
                    label={f.label}
                    required={f.required}
                    headers={sheet.headers}
                    value={stockMapping?.[f.key] ?? ''}
                    onChange={(v) => setStockMapping((m) => (m ? { ...m, [f.key]: v || null } : m))}
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
          <h3 className="text-sm font-semibold text-slate-700">Istoric importuri</h3>
          <p className="mb-3 mt-0.5 text-xs text-slate-400">
            Ștergerea unui import elimină doar rândurile aduse de el (bonuri, recepții sau instantaneul de stoc). Pentru
            un import de stoc, produsele afectate revin la ultimul instantaneu rămas — sau la „necunoscut” dacă nu mai
            rămâne niciunul.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1.5">Fișier</th>
                  <th className="px-2 py-1.5">Tip</th>
                  <th className="px-2 py-1.5">Importat la</th>
                  <th className="px-2 py-1.5 text-right">Rânduri</th>
                  <th className="px-2 py-1.5">Interval / Valabil la</th>
                  <th className="px-2 py-1.5">Calitate</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {importBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-2 py-1.5">{b.filename}</td>
                    <td className="px-2 py-1.5">{KIND_LABELS[b.kind]}</td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {new Date(b.importedAt).toLocaleString('ro-RO')}
                    </td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(b.rowCount)}</td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {b.dateMin && b.dateMax
                        ? b.kind === 'stock'
                          ? formatDateRo(b.dateMin)
                          : `${formatDateRo(b.dateMin)} – ${formatDateRo(b.dateMax)}`
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-slate-500">
                      {b.duplicateRowCount === 0 && b.invalidRowCount === 0 ? (
                        <span className="text-good">fără probleme</span>
                      ) : (
                        <span className="text-warn">
                          {b.duplicateRowCount > 0 && `${formatNumber(b.duplicateRowCount)} duplicate`}
                          {b.duplicateRowCount > 0 && b.invalidRowCount > 0 && ' · '}
                          {b.invalidRowCount > 0 && `${formatNumber(b.invalidRowCount)} invalide`}
                        </span>
                      )}
                      {(b.newProductCount > 0 || b.newCashierCount > 0) && (
                        <div className="text-slate-400">
                          {b.newProductCount > 0 && `+${formatNumber(b.newProductCount)} produse`}
                          {b.newProductCount > 0 && b.newCashierCount > 0 && ' · '}
                          {b.newCashierCount > 0 && `+${formatNumber(b.newCashierCount)} casieri`}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {pendingDeleteId === b.id ? (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-xs text-slate-500">Sigur?</span>
                          <button
                            onClick={() => handleDelete(b)}
                            disabled={deletingId === b.id}
                            className="rounded bg-bad px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                          >
                            {deletingId === b.id ? 'Se șterge...' : 'Da, șterge'}
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(null)}
                            disabled={deletingId === b.id}
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
                          >
                            Anulează
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setPendingDeleteId(b.id)}
                          className="rounded px-2 py-0.5 text-xs text-bad hover:bg-bad/10"
                          title="Șterge toate datele aduse de acest import"
                        >
                          Șterge
                        </button>
                      )}
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
