import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Link } from 'react-router-dom'
import { importProductCatalog } from '../nomenclature/productService'
import type { ProductCatalogImportSummary, ProductCatalogRow } from '../nomenclature/productService'
import { formatNumber, normalizeHeader } from '../lib/ro-format'

const NONE = '__none__'

type FieldId = 'name' | 'code' | 'category' | 'subcategory'

const FIELD_ALIASES: Record<FieldId, string[]> = {
  name: ['denumire produs', 'produs', 'articol', 'denumire articol', 'nume produs'],
  code: ['cod produs', 'cod articol', 'cod', 'sku'],
  category: ['categorie', 'grupa', 'grupa produs', 'grupa de produse'],
  subcategory: ['subcategorie', 'sub-categorie', 'sub categorie', 'subgrupa'],
}

const FIELD_LABELS: Record<FieldId, string> = {
  name: 'Denumire produs',
  code: 'Cod produs (opțional)',
  category: 'Categorie',
  subcategory: 'Subcategorie (opțional)',
}

function autoDetect(headers: string[]): Partial<Record<FieldId, string>> {
  const normalized = headers.map((h) => ({ header: h, norm: normalizeHeader(h) }))
  const mapping: Partial<Record<FieldId, string>> = {}
  const used = new Set<string>()

  for (const field of Object.keys(FIELD_ALIASES) as FieldId[]) {
    const aliasesNorm = FIELD_ALIASES[field].map((a) => normalizeHeader(a))
    let best: { header: string; score: number } | null = null
    for (const { header, norm } of normalized) {
      if (used.has(header) || norm === '') continue
      let score = 0
      if (aliasesNorm.includes(norm)) score = 100
      else if (aliasesNorm.some((a) => norm.startsWith(a) || a.startsWith(norm))) score = 80
      else if (aliasesNorm.some((a) => norm.includes(a) || a.includes(norm))) score = 60
      if (score > 0 && (!best || score > best.score)) best = { header, score }
    }
    if (best) {
      mapping[field] = best.header
      used.add(best.header)
    }
  }
  return mapping
}

/** Import catalog produse: categorie + subcategorie „sfinte" pentru fiecare produs, indiferent de importurile de vânzări. */
export function ProductCatalogImportPage() {
  const [headers, setHeaders] = useState<string[] | null>(null)
  const [rows, setRows] = useState<unknown[][] | null>(null)
  const [mapping, setMapping] = useState<Partial<Record<FieldId, string>>>({})
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ProductCatalogImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setSummary(null)
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as unknown[][]
    if (aoa.length === 0) {
      setError('Fișierul e gol.')
      return
    }
    const fileHeaders = aoa[0].map((h) => String(h ?? '').trim())
    const dataRows = aoa.slice(1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
    setHeaders(fileHeaders)
    setRows(dataRows)
    setMapping(autoDetect(fileHeaders))
  }

  function colIndex(field: FieldId): number {
    const header = mapping[field]
    if (!header || !headers) return -1
    return headers.indexOf(header)
  }

  function buildCatalogRows(): ProductCatalogRow[] {
    if (!rows) return []
    const nameIdx = colIndex('name')
    const codeIdx = colIndex('code')
    const categoryIdx = colIndex('category')
    const subcategoryIdx = colIndex('subcategory')
    return rows.map((r) => ({
      name: nameIdx >= 0 ? String(r[nameIdx] ?? '').trim() : '',
      code: codeIdx >= 0 ? String(r[codeIdx] ?? '').trim() || undefined : undefined,
      category: categoryIdx >= 0 ? String(r[categoryIdx] ?? '').trim() : '',
      subcategory: subcategoryIdx >= 0 ? String(r[subcategoryIdx] ?? '').trim() || undefined : undefined,
    }))
  }

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      const catalogRows = buildCatalogRows()
      const result = await importProductCatalog(catalogRows)
      setSummary(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const canConfirm = !!mapping.name && !!mapping.category && (rows?.length ?? 0) > 0

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Import catalog produse</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Importă lista completă de produse cu categorie și subcategorie. Odată setate aici, rămân fixe — importurile de
        vânzări din Mentor nu le modifică niciodată, indiferent ce coloană „Categorie" au. Poți rula acest import oricând
        (inclusiv înainte de primul import de vânzări) și poți reimporta oricând pentru a actualiza categorizarea.{' '}
        <Link to="/nomenclator-produse" className="text-emerald-700 dark:text-emerald-400 hover:underline">
          Vezi nomenclatorul de produse
        </Link>
        .
      </p>

      {!headers ? (
        <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 text-center">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <p className="text-xs text-slate-400 mt-3">
            Fișier Excel cu coloane pentru denumire produs, categorie și (opțional) subcategorie și cod produs.
          </p>
        </div>
      ) : (
        <div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-4">
            <div className="text-sm font-medium mb-3">Mapare coloane ({formatNumber(rows?.length ?? 0)} rânduri detectate)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(Object.keys(FIELD_LABELS) as FieldId[]).map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-slate-500 block mb-1">{FIELD_LABELS[field]}</label>
                  <select
                    className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
                    value={mapping[field] ?? NONE}
                    onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value === NONE ? undefined : e.target.value }))}
                  >
                    <option value={NONE}>— nicio coloană —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {rows && rows.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg mb-4">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    {(Object.keys(FIELD_LABELS) as FieldId[]).map((field) => (
                      <th key={field} className="px-3 py-2 text-left font-medium">
                        {FIELD_LABELS[field]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buildCatalogRows()
                    .slice(0, 5)
                    .map((r, i) => (
                      <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-1.5">{r.name || '—'}</td>
                        <td className="px-3 py-1.5">{r.code || '—'}</td>
                        <td className="px-3 py-1.5">{r.category || '—'}</td>
                        <td className="px-3 py-1.5">{r.subcategory || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                Previzualizare — primele 5 din {formatNumber(rows.length)} rânduri.
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || busy}
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? 'Se importă…' : 'Confirmă importul'}
            </button>
            <button
              onClick={() => {
                setHeaders(null)
                setRows(null)
                setMapping({})
                setSummary(null)
                setError(null)
              }}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Alege alt fișier
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg p-4 mb-4">
          Eroare: {error}
        </div>
      )}

      {summary && (
        <div className="border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 rounded-lg p-4">
          <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">Import finalizat.</div>
          <ul className="text-sm text-emerald-800 dark:text-emerald-300 space-y-0.5">
            <li>{formatNumber(summary.productsCreated)} produse noi create</li>
            <li>{formatNumber(summary.productsUpdated)} produse existente actualizate cu categorie/subcategorie</li>
            <li>{formatNumber(summary.categoriesCreated)} categorii noi</li>
            <li>{formatNumber(summary.subcategoriesCreated)} subcategorii noi</li>
            {summary.skipped.length > 0 && <li>{formatNumber(summary.skipped.length)} rânduri sărite (fără denumire sau categorie)</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
