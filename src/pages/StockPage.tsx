import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { useDataStore } from '@/store/dataStore'
import { useDrillFilterStore } from '@/store/drillFilterStore'
import {
  computeStockRotation,
  STOCK_RISK_LABELS,
  type StockRiskClass,
  type StockRotationRow,
} from '@/kpi/stockRotation'
import { computeProductProfitability } from '@/kpi/profitability'
import { filterByRange } from '@/kpi/applyFilters'
import { getSettings, updateSettings } from '@/data/repo/settings'
import { defaultStockThresholds, type Product, type StockThresholds } from '@/types/domain'
import { addDays, reportingEndStr, type DateRange } from '@/kpi/dateRanges'
import { formatDateRo, formatLei, formatNumber } from '@/lib/format'

interface CompareRow {
  product: Product
  currentStock: number | null
  stockValue: number | null
  qty7: number
  profit7: number | null
  qty30: number
  profit30: number | null
}

type WindowPreset = 14 | 30 | 60 | 90

const RISK_TONE: Record<StockRiskClass, 'good' | 'warn' | 'bad' | 'neutral'> = {
  'risc-ruptura': 'bad',
  'stoc-scazut': 'warn',
  'stoc-sanatos': 'good',
  suprastoc: 'neutral',
  necunoscut: 'neutral',
}

function formatDays(value: number | null): string {
  if (value == null) return '—'
  if (!Number.isFinite(value)) return '∞'
  return formatNumber(value, 0)
}

export function StockPage() {
  const { transactions, products, supplierReceipts, settings } = useDataStore()
  const [windowPreset, setWindowPreset] = useState<WindowPreset>(30)
  const [thresholds, setThresholds] = useState<StockThresholds>(defaultStockThresholds)
  const [thresholdsByCategory, setThresholdsByCategory] = useState<Record<string, StockThresholds>>({})
  const [thresholdsSaved, setThresholdsSaved] = useState(false)
  const [riskFilter, setRiskFilter] = useState<StockRiskClass | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [productQuery, setProductQuery] = useState('')
  const [presetIds, setPresetIds] = useState<string[] | null>(() => useDrillFilterStore.getState().consume('/stoc'))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)

  useEffect(() => {
    getSettings().then((s) => {
      setThresholds(s.stockThresholds)
      setThresholdsByCategory(s.stockThresholdsByCategory)
    })
  }, [])

  // Se oprește ieri, nu azi — altfel media de vânzare/zi și "days of stock"
  // ar fi calculate incluzând o zi parțială, umflând artificial rezervele.
  const range: DateRange = useMemo(() => {
    const end = reportingEndStr()
    return { start: addDays(end, -(windowPreset - 1)), end }
  }, [windowPreset])

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(), [products])

  const thresholdsForCategory = useMemo(
    () => (category: string) => thresholdsByCategory[category] ?? thresholds,
    [thresholds, thresholdsByCategory],
  )

  const rows = useMemo(
    () => computeStockRotation(transactions, products, range, thresholdsForCategory),
    [transactions, products, range, thresholdsForCategory],
  )

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (presetIds && !presetIds.includes(r.product.id)) return false
      if (riskFilter !== 'all' && r.riskClass !== riskFilter) return false
      if (categoryFilter !== 'all' && r.product.category !== categoryFilter) return false
      if (productQuery && !r.product.name.toLowerCase().includes(productQuery.toLowerCase())) return false
      return true
    })
  }, [rows, presetIds, riskFilter, categoryFilter, productQuery])

  const totalBlockedCapital = useMemo(() => rows.reduce((s, r) => s + (r.blockedCapital ?? 0), 0), [rows])
  const ruptureCount = rows.filter((r) => r.riskClass === 'risc-ruptura').length
  const overstockCount = rows.filter((r) => r.riskClass === 'suprastoc').length
  const noSale90Count = rows.filter((r) => r.noSaleDays === 90).length

  const defaultVatRatePct = settings?.defaultVatRatePct ?? 19
  const compareRows: CompareRow[] = useMemo(() => {
    if (selectedIds.size === 0) return []
    const end = reportingEndStr()
    const tx7 = filterByRange(transactions, addDays(end, -6), end)
    const tx30 = filterByRange(transactions, addDays(end, -29), end)
    const profit7ById = new Map(
      computeProductProfitability(tx7, products, supplierReceipts, defaultVatRatePct).map((r) => [r.product.id, r]),
    )
    const profit30ById = new Map(
      computeProductProfitability(tx30, products, supplierReceipts, defaultVatRatePct).map((r) => [r.product.id, r]),
    )
    const stockById = new Map(rows.map((r) => [r.product.id, r]))
    const result: CompareRow[] = []
    for (const id of selectedIds) {
      const stockRow = stockById.get(id)
      const product = stockRow?.product ?? products.find((p) => p.id === id)
      if (!product) continue
      result.push({
        product,
        currentStock: stockRow?.currentStock ?? null,
        stockValue: stockRow?.stockValue ?? null,
        qty7: profit7ById.get(id)?.quantity ?? 0,
        profit7: profit7ById.get(id)?.grossProfit ?? null,
        qty30: profit30ById.get(id)?.quantity ?? 0,
        profit30: profit30ById.get(id)?.grossProfit ?? null,
      })
    }
    return result.sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [selectedIds, transactions, products, supplierReceipts, defaultVatRatePct, rows])

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function saveThresholds() {
    await updateSettings({ stockThresholds: thresholds, stockThresholdsByCategory: thresholdsByCategory })
    setThresholdsSaved(true)
    setTimeout(() => setThresholdsSaved(false), 2000)
  }

  function setCategoryOverride(category: string, patch: Partial<StockThresholds> | null) {
    setThresholdsByCategory((m) => {
      if (patch === null) {
        const { [category]: _removed, ...rest } = m
        return rest
      }
      return { ...m, [category]: { ...(m[category] ?? thresholds), ...patch } }
    })
  }

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Stoc & Rotație" />
        <EmptyState />
      </div>
    )
  }

  const columns: DataTableColumn<StockRotationRow>[] = [
    {
      key: 'select',
      header: '',
      render: (r) => (
        <input
          type="checkbox"
          checked={selectedIds.has(r.product.id)}
          onChange={(e) => toggleSelected(r.product.id, e.target.checked)}
        />
      ),
    },
    { key: 'name', header: 'Produs', render: (r) => r.product.name, sortValue: (r) => r.product.name },
    { key: 'category', header: 'Categorie', render: (r) => r.product.category, sortValue: (r) => r.product.category },
    {
      key: 'stock',
      header: 'Stoc actual',
      align: 'right',
      render: (r) => (r.currentStock != null ? formatNumber(r.currentStock, 2) : '—'),
      sortValue: (r) => r.currentStock ?? -1,
    },
    {
      key: 'stockValue',
      header: 'Valoare stoc',
      align: 'right',
      render: (r) => (r.stockValue != null ? formatLei(r.stockValue) : '—'),
      sortValue: (r) => r.stockValue ?? -1,
    },
    { key: 'avgDay', header: 'Vânzare medie/zi', align: 'right', render: (r) => formatNumber(r.avgPerDay, 2), sortValue: (r) => r.avgPerDay },
    {
      key: 'lastSale',
      header: 'Ultima vânzare',
      render: (r) => (r.lastSaleDate ? formatDateRo(r.lastSaleDate) : 'Niciodată'),
      sortValue: (r) => r.lastSaleDate ?? '',
    },
    {
      key: 'daysSince',
      header: 'Zile de la ultima vânzare',
      align: 'right',
      render: (r) => (r.daysSinceLastSale != null ? formatNumber(r.daysSinceLastSale) : '—'),
      sortValue: (r) => r.daysSinceLastSale ?? 99999,
    },
    {
      key: 'dos',
      header: 'Days of Stock',
      align: 'right',
      render: (r) => formatDays(r.daysOfStock),
      sortValue: (r) => (r.daysOfStock == null ? -1 : r.daysOfStock),
    },
    {
      key: 'cost',
      header: 'Cost unitar',
      align: 'right',
      render: (r) => (r.costUnit != null ? formatLei(r.costUnit) : '—'),
      sortValue: (r) => r.costUnit ?? -1,
    },
    {
      key: 'blocked',
      header: 'Capital blocat',
      align: 'right',
      render: (r) => (r.blockedCapital != null ? formatLei(r.blockedCapital) : '—'),
      sortValue: (r) => r.blockedCapital ?? -1,
    },
    {
      key: 'risk',
      header: 'Risc stoc',
      render: (r) => <Badge tone={RISK_TONE[r.riskClass]}>{STOCK_RISK_LABELS[r.riskClass]}</Badge>,
      sortValue: (r) => r.riskClass,
    },
    {
      key: 'noSale',
      header: 'Fără vânzare',
      render: (r) => (r.noSaleDays != null ? <Badge tone="warn">{r.neverSold ? 'niciodată' : `${r.noSaleDays}+ zile`}</Badge> : '—'),
      sortValue: (r) => r.noSaleDays ?? -1,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Stoc & Rotație"
        description="Cât stoc ai, cât capital ține blocat și cât de riscant e — pe baza ultimului instantaneu de stoc importat."
      />

      {presetIds && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <span>
            Filtrat din alertă: {formatNumber(presetIds.length)} produse.
          </span>
          <button onClick={() => setPresetIds(null)} className="ml-auto rounded border border-brand-200 px-2 py-0.5 text-xs hover:bg-brand-100">
            Șterge filtrul
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-xs text-slate-500">Fereastră analiză viteză vânzare:</span>
        <div className="flex gap-1">
          {([14, 30, 60, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => setWindowPreset(d)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                windowPreset === d ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {d} zile
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as StockRiskClass | 'all')}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="all">Toate riscurile</option>
            {(Object.keys(STOCK_RISK_LABELS) as StockRiskClass[]).map((c) => (
              <option key={c} value={c}>
                {STOCK_RISK_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="all">Toate categoriile</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Caută produs..."
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Produse analizate" value={formatNumber(rows.length)} />
        <StatBox label="Risc ruptură" value={formatNumber(ruptureCount)} tone={ruptureCount > 0 ? 'bad' : 'default'} />
        <StatBox label="Suprastoc" value={formatNumber(overstockCount)} tone={overstockCount > 0 ? 'warn' : 'default'} />
        <StatBox label="Fără vânzare 90+ zile" value={formatNumber(noSale90Count)} tone={noSale90Count > 0 ? 'warn' : 'default'} />
      </div>

      <div className="mb-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm">
          Capital total blocat în stoc (stoc × cost, unde ambele sunt cunoscute):{' '}
          <span className="font-semibold text-slate-900">{formatLei(totalBlockedCapital)}</span>
        </p>

        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Praguri Days of Stock (configurabile)</summary>
          <div className="mt-3">
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <ThresholdField
                label="Risc ruptură — sub"
                value={thresholds.ruptureDays}
                onChange={(v) => setThresholds((t) => ({ ...t, ruptureDays: v }))}
              />
              <ThresholdField
                label="Stoc scăzut — sub"
                value={thresholds.lowDays}
                onChange={(v) => setThresholds((t) => ({ ...t, lowDays: v }))}
              />
              <ThresholdField
                label="Suprastoc — peste"
                value={thresholds.overstockDays}
                onChange={(v) => setThresholds((t) => ({ ...t, overstockDays: v }))}
              />
            </div>
            {categories.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-medium text-slate-600">Excepții pe categorie (opțional)</p>
                <div className="space-y-2">
                  {categories.map((c) => {
                    const override = thresholdsByCategory[c]
                    return (
                      <div key={c} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={!!override}
                            onChange={(e) => setCategoryOverride(c, e.target.checked ? {} : null)}
                          />
                          {c}
                        </label>
                        {override && (
                          <div className="flex flex-wrap gap-2">
                            <ThresholdField
                              compact
                              label="ruptură"
                              value={override.ruptureDays}
                              onChange={(v) => setCategoryOverride(c, { ruptureDays: v })}
                            />
                            <ThresholdField
                              compact
                              label="scăzut"
                              value={override.lowDays}
                              onChange={(v) => setCategoryOverride(c, { lowDays: v })}
                            />
                            <ThresholdField
                              compact
                              label="suprastoc"
                              value={override.overstockDays}
                              onChange={(v) => setCategoryOverride(c, { overstockDays: v })}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={saveThresholds} className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600">
                Salvează pragurile
              </button>
              {thresholdsSaved && <span className="text-sm text-good">Salvat.</span>}
            </div>
          </div>
        </details>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">
            {selectedIds.size > 0 ? `${formatNumber(selectedIds.size)} produse selectate` : 'Bifează produse pentru a le compara'}
          </span>
          <button
            onClick={() => setSelectedIds(new Set(filteredRows.map((r) => r.product.id)))}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Selectează tot ({formatNumber(filteredRows.length)})
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Golește selecția
            </button>
          )}
          <button
            onClick={() => setCompareOpen(true)}
            disabled={selectedIds.size === 0}
            className="ml-auto rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Aplică — vezi detalii produse selectate
          </button>
        </div>
        <DataTable columns={columns} rows={filteredRows} rowKey={(r) => r.product.id} searchable={false} defaultSortKey="dos" pageSize={30} />
      </div>

      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        title="Produse selectate"
        subtitle={`${formatNumber(compareRows.length)} produse — stoc curent și performanță pe ultimele 7 și 30 de zile`}
        wide
      >
        {compareRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nimic selectat.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Produs</th>
                  <th className="px-3 py-2">Categorie</th>
                  <th className="px-3 py-2 text-right">Stoc actual</th>
                  <th className="px-3 py-2 text-right">Cant. 7 zile</th>
                  <th className="px-3 py-2 text-right">Profit 7 zile</th>
                  <th className="px-3 py-2 text-right">Cant. 30 zile</th>
                  <th className="px-3 py-2 text-right">Profit 30 zile</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {compareRows.map((r) => (
                  <tr key={r.product.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{r.product.name}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.product.category}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700">
                      {r.currentStock != null ? formatNumber(r.currentStock, 2) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-700">{formatNumber(r.qty7, 2)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700">
                      {r.profit7 != null ? formatLei(r.profit7) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-700">{formatNumber(r.qty30, 2)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700">
                      {r.profit30 != null ? formatLei(r.profit30) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => toggleSelected(r.product.id, false)}
                        className="text-xs text-slate-400 hover:text-bad"
                        title="Scoate din selecție"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}

function StatBox({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warn' | 'bad'
}) {
  const color = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}

function ThresholdField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  compact?: boolean
}) {
  return (
    <label className={compact ? 'flex items-center gap-1 text-xs text-slate-600' : 'text-xs text-slate-600'}>
      <span className={compact ? '' : 'mb-1 block font-medium'}>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={compact ? 'w-16 rounded border border-slate-200 px-1.5 py-0.5 text-xs' : 'w-full rounded border border-slate-200 px-2 py-1 text-sm'}
      />
      <span className="ml-1 text-slate-400">zile</span>
    </label>
  )
}
