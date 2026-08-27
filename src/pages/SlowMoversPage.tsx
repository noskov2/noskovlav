import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DrillValue } from '@/components/ui/DrillValue'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { useDataStore } from '@/store/dataStore'
import { useDrillFilterStore } from '@/store/drillFilterStore'
import { computeSlowMovers, MOVEMENT_LABELS, type MovementClass, type SlowMoverRow } from '@/kpi/slowMovers'
import { addDays, reportingEndStr, type DateRange } from '@/kpi/dateRanges'
import { previousMonthRange, computeDelta } from '@/kpi/monthComparison'
import { formatDateRo, formatLei, formatNumber } from '@/lib/format'

type WindowPreset = 7 | 14 | 30 | 60 | 'custom'

const CLASS_TONE: Record<MovementClass, 'good' | 'warn' | 'bad' | 'neutral'> = {
  activ: 'good',
  lent: 'warn',
  'foarte-lent': 'bad',
  'fara-vanzare': 'neutral',
}

export function SlowMoversPage() {
  const { transactions, products, stockSnapshots, supplierReceipts } = useDataStore()
  const [windowPreset, setWindowPreset] = useState<WindowPreset>(30)
  const [customRange, setCustomRange] = useState<DateRange>({ start: addDays(reportingEndStr(), -29), end: reportingEndStr() })
  const [category, setCategory] = useState('all')
  const [productQuery, setProductQuery] = useState('')
  const [classFilter, setClassFilter] = useState<MovementClass | 'all'>('all')
  const [presetIds, setPresetIds] = useState<string[] | null>(() => useDrillFilterStore.getState().consume('/vanzare-slaba'))

  const range: DateRange = useMemo(() => {
    if (windowPreset === 'custom') return customRange
    // Se oprește ieri, nu azi — o zi parțială ar umfla artificial rata de
    // vânzare/zi și ar clasifica greșit produse ca "lente".
    const end = reportingEndStr()
    return { start: addDays(end, -(windowPreset - 1)), end }
  }, [windowPreset, customRange])

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  )

  const rows = useMemo(
    () => computeSlowMovers(transactions, products, range, supplierReceipts),
    [transactions, products, range, supplierReceipts],
  )

  const [compare, setCompare] = useState(false)
  const prevRange = useMemo(() => previousMonthRange(range), [range])
  const prevRows = useMemo(
    () => computeSlowMovers(transactions, products, prevRange, supplierReceipts),
    [transactions, products, prevRange, supplierReceipts],
  )
  const prevSalesByProduct = useMemo(() => new Map(prevRows.map((r) => [r.product.id, r.salesValue])), [prevRows])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (presetIds && !presetIds.includes(r.product.id)) return false
      if (category !== 'all' && r.product.category !== category) return false
      if (productQuery && !r.product.name.toLowerCase().includes(productQuery.toLowerCase())) return false
      if (classFilter !== 'all' && r.classification !== classFilter) return false
      return true
    })
  }, [rows, presetIds, category, productQuery, classFilter])

  const worst = useMemo(
    () =>
      [...rows]
        .filter((r) => r.classification !== 'activ')
        .sort((a, b) => a.avgPerDay - b.avgPerDay)
        .slice(0, 10),
    [rows],
  )

  const blockedValueTotal = useMemo(
    () => rows.reduce((s, r) => s + (r.blockedStockValue ?? 0), 0),
    [rows],
  )

  const latestStockAsOf = useMemo(
    () => (stockSnapshots.length > 0 ? Math.max(...stockSnapshots.map((s) => s.asOf)) : null),
    [stockSnapshots],
  )

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Produse cu vânzare slabă / stoc blocat" />
        <EmptyState />
      </div>
    )
  }

  const columns: DataTableColumn<SlowMoverRow>[] = [
    { key: 'name', header: 'Produs', render: (r) => r.product.name, sortValue: (r) => r.product.name },
    { key: 'category', header: 'Categorie', render: (r) => r.product.category, sortValue: (r) => r.product.category },
    {
      key: 'qty',
      header: 'Cantitate vândută',
      align: 'right',
      render: (r) => (
        <DrillValue
          title={`${r.product.name} — vânzări în perioadă`}
          lines={transactions.filter((t) => t.productId === r.product.id && t.date >= range.start && t.date <= range.end)}
        >
          {formatNumber(r.quantitySold, 2)}
        </DrillValue>
      ),
      sortValue: (r) => r.quantitySold,
    },
    {
      key: 'avgDay',
      header: 'Vânzare medie/zi',
      align: 'right',
      render: (r) => formatNumber(r.avgPerDay, 2),
      sortValue: (r) => r.avgPerDay,
    },
    {
      key: 'value',
      header: 'Valoare vânzări',
      align: 'right',
      render: (r) => formatLei(r.salesValue),
      sortValue: (r) => r.salesValue,
    },
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
      key: 'lastReceipt',
      header: 'Ultima recepție',
      render: (r) => (r.lastReceiptDate ? formatDateRo(r.lastReceiptDate) : '—'),
      sortValue: (r) => r.lastReceiptDate ?? '',
    },
    {
      key: 'blocked',
      header: 'Bani blocați',
      align: 'right',
      render: (r) => (r.blockedStockValue != null ? formatLei(r.blockedStockValue) : '—'),
      sortValue: (r) => r.blockedStockValue ?? -1,
    },
    {
      key: 'class',
      header: 'Clasificare',
      render: (r) => <Badge tone={CLASS_TONE[r.classification]}>{MOVEMENT_LABELS[r.classification]}</Badge>,
      sortValue: (r) => r.classification,
    },
    ...(compare
      ? ([
          {
            key: 'vsLastMonth',
            header: 'vs. luna anterioară',
            align: 'right',
            render: (r) => <DeltaBadge delta={computeDelta(r.salesValue, prevSalesByProduct.get(r.product.id) ?? 0)} />,
            sortValue: (r) => computeDelta(r.salesValue, prevSalesByProduct.get(r.product.id) ?? 0).pct ?? -Infinity,
          },
        ] as DataTableColumn<SlowMoverRow>[])
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Produse cu vânzare slabă / stoc blocat"
        description="Identifică produsele care se vând greu și, dacă introduci stocul curent, banii blocați în ele."
      />

      {presetIds && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <span>Filtrat din alertă: {formatNumber(presetIds.length)} produse.</span>
          <button onClick={() => setPresetIds(null)} className="ml-auto rounded border border-brand-200 px-2 py-0.5 text-xs hover:bg-brand-100">
            Șterge filtrul
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-1">
          {([7, 14, 30, 60] as const).map((d) => (
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
          <button
            onClick={() => setWindowPreset('custom')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              windowPreset === 'custom' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Personalizat
          </button>
        </div>
        {windowPreset === 'custom' && (
          <div className="flex items-center gap-1.5 text-sm">
            <input
              type="date"
              value={customRange.start}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
            <span className="text-slate-400">–</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs"
            />
          </div>
        )}
        <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">
          {formatDateRo(range.start)} – {formatDateRo(range.end)}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as MovementClass | 'all')}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            <option value="all">Toate clasificările</option>
            {(Object.keys(MOVEMENT_LABELS) as MovementClass[]).map((c) => (
              <option key={c} value={c}>
                {MOVEMENT_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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

      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm">
        <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
        Compară vânzările fiecărui produs cu luna anterioară
      </label>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Produse analizate" value={formatNumber(rows.length)} />
        <StatBox label="Fără vânzare" value={formatNumber(rows.filter((r) => r.classification === 'fara-vanzare').length)} tone="bad" />
        <StatBox label="Foarte lente" value={formatNumber(rows.filter((r) => r.classification === 'foarte-lent').length)} tone="warn" />
        <StatBox
          label="Bani blocați (estimat)"
          value={formatLei(blockedValueTotal)}
          tone={blockedValueTotal > 0 ? 'warn' : 'default'}
          hint={
            latestStockAsOf
              ? `stoc valabil la ${new Date(latestStockAsOf).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : 'niciun stoc importat încă'
          }
        />
      </div>

      {worst.length > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Clasament — cele mai slabe produse</h3>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {worst.map((r, i) => (
              <li key={r.product.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-slate-50">
                <span className="truncate text-slate-700">
                  <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                  {r.product.name}
                </span>
                <Badge tone={CLASS_TONE[r.classification]}>{MOVEMENT_LABELS[r.classification]}</Badge>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable
          columns={columns}
          rows={filteredRows}
          rowKey={(r) => r.product.id}
          searchable={false}
          defaultSortKey="daysSince"
          pageSize={30}
        />
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn' | 'bad'
}) {
  const color = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}
