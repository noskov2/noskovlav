import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DrillValue } from '@/components/ui/DrillValue'
import { useDataStore } from '@/store/dataStore'
import { computeSlowMovers, MOVEMENT_LABELS, type MovementClass, type SlowMoverRow } from '@/kpi/slowMovers'
import { addDays, todayStr, type DateRange } from '@/kpi/dateRanges'
import { formatDateRo, formatLei, formatNumber } from '@/lib/format'

type WindowPreset = 7 | 14 | 30 | 60 | 'custom'

const CLASS_TONE: Record<MovementClass, 'good' | 'warn' | 'bad' | 'neutral'> = {
  activ: 'good',
  lent: 'warn',
  'foarte-lent': 'bad',
  'fara-vanzare': 'neutral',
}

export function SlowMoversPage() {
  const { transactions, products } = useDataStore()
  const [windowPreset, setWindowPreset] = useState<WindowPreset>(30)
  const [customRange, setCustomRange] = useState<DateRange>({ start: addDays(todayStr(), -30), end: todayStr() })
  const [category, setCategory] = useState('all')
  const [productQuery, setProductQuery] = useState('')
  const [classFilter, setClassFilter] = useState<MovementClass | 'all'>('all')

  const range: DateRange = useMemo(() => {
    if (windowPreset === 'custom') return customRange
    const today = todayStr()
    return { start: addDays(today, -(windowPreset - 1)), end: today }
  }, [windowPreset, customRange])

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  )

  const rows = useMemo(() => computeSlowMovers(transactions, products, range), [transactions, products, range])

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (category !== 'all' && r.product.category !== category) return false
      if (productQuery && !r.product.name.toLowerCase().includes(productQuery.toLowerCase())) return false
      if (classFilter !== 'all' && r.classification !== classFilter) return false
      return true
    })
  }, [rows, category, productQuery, classFilter])

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
  ]

  return (
    <div>
      <PageHeader
        title="Produse cu vânzare slabă / stoc blocat"
        description="Identifică produsele care se vând greu și, dacă introduci stocul curent, banii blocați în ele."
      />

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

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Produse analizate" value={formatNumber(rows.length)} />
        <StatBox label="Fără vânzare" value={formatNumber(rows.filter((r) => r.classification === 'fara-vanzare').length)} tone="bad" />
        <StatBox label="Foarte lente" value={formatNumber(rows.filter((r) => r.classification === 'foarte-lent').length)} tone="warn" />
        <StatBox label="Bani blocați (estimat)" value={formatLei(blockedValueTotal)} tone={blockedValueTotal > 0 ? 'warn' : 'default'} />
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

function StatBox({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}
