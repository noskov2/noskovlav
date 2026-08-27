import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { AlertDot } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { TrendChart } from '@/components/charts/TrendChart'
import { useDataStore } from '@/store/dataStore'
import { useDrillFilterStore } from '@/store/drillFilterStore'
import { computeProductPriceSummaries, type ProductPriceSummary } from '@/kpi/suppliers'
import { computeSupplierImpact } from '@/kpi/supplierImpact'
import { computeSupplierRanking, type SupplierRankingRow } from '@/kpi/supplierRanking'
import { todayStr, monthLabel } from '@/kpi/dateRanges'
import { updateSettings } from '@/data/repo/settings'
import { formatDateRo, formatLei, formatNumber, formatSignedLei, formatSignedPct } from '@/lib/format'

export function SuppliersPage() {
  const { supplierReceipts, products, transactions, settings, refresh } = useDataStore()
  const [selected, setSelected] = useState<ProductPriceSummary | null>(null)
  const [presetIds, setPresetIds] = useState<string[] | null>(() => useDrillFilterStore.getState().consume('/furnizori'))

  // "Toate lunile" (all-time) stays the default so the ranking's baseline
  // behavior is unchanged — picking a month scopes both the purchases AND
  // the attributed sales to that same month, so the row reads as one
  // coherent period instead of mixing an all-time sales figure with a
  // single month's purchases.
  const [supplierMonth, setSupplierMonth] = useState<string>('all')
  const supplierMonthOptions = useMemo(() => {
    const keys = new Set(supplierReceipts.map((r) => r.date.slice(0, 7)))
    return Array.from(keys).sort().reverse()
  }, [supplierReceipts])
  const monthFilteredReceipts = useMemo(
    () => (supplierMonth === 'all' ? supplierReceipts : supplierReceipts.filter((r) => r.date.slice(0, 7) === supplierMonth)),
    [supplierReceipts, supplierMonth],
  )
  const monthFilteredTransactions = useMemo(
    () => (supplierMonth === 'all' ? transactions : transactions.filter((t) => t.date.slice(0, 7) === supplierMonth)),
    [transactions, supplierMonth],
  )
  const supplierRanking = useMemo(
    () => computeSupplierRanking(monthFilteredReceipts, monthFilteredTransactions, products),
    [monthFilteredReceipts, monthFilteredTransactions, products],
  )

  const summaries = useMemo(() => computeProductPriceSummaries(supplierReceipts, products), [supplierReceipts, products])
  const displaySummaries = useMemo(
    () => (presetIds ? summaries.filter((s) => presetIds.includes(s.product.id)) : summaries),
    [summaries, presetIds],
  )

  const impactAsOf = useMemo(() => {
    if (transactions.length === 0) return todayStr()
    return transactions.reduce((max, t) => (t.date > max ? t.date : max), transactions[0].date)
  }, [transactions])
  const impactRows = useMemo(
    () => computeSupplierImpact(summaries, transactions, impactAsOf),
    [summaries, transactions, impactAsOf],
  )
  const hikeImpacts = useMemo(
    () =>
      impactRows
        .filter((r) => r.hikeImpactPerMonth != null && r.hikeImpactPerMonth > 0)
        .sort((a, b) => (b.hikeImpactPerMonth ?? 0) - (a.hikeImpactPerMonth ?? 0)),
    [impactRows],
  )
  const savingOpportunities = useMemo(
    () =>
      impactRows
        .filter((r) => r.theoreticalMonthlySaving != null && r.theoreticalMonthlySaving > 0)
        .sort((a, b) => (b.theoreticalMonthlySaving ?? 0) - (a.theoreticalMonthlySaving ?? 0)),
    [impactRows],
  )

  const knownSuppliersPanel = (
    <KnownSuppliersPanel
      knownSuppliers={settings?.knownSuppliers ?? []}
      onSave={async (list) => {
        await updateSettings({ knownSuppliers: list })
        await refresh()
      }}
    />
  )

  if (supplierReceipts.length === 0) {
    return (
      <div>
        <PageHeader title="Furnizori și evoluția prețurilor" />
        {knownSuppliersPanel}
        <EmptyState
          icon="🚚"
          title="Nicio achiziție încărcată încă"
          description="Mergi la Import date → Achiziții/Furnizori pentru a încărca exportul de recepții/facturi de la furnizori (produs, furnizor, dată, cantitate, preț)."
        />
      </div>
    )
  }

  const supplierRankingColumns: DataTableColumn<SupplierRankingRow>[] = [
    { key: 'supplier', header: 'Furnizor', render: (r) => r.supplier, sortValue: (r) => r.supplier },
    { key: 'productCount', header: 'Produse', align: 'right', render: (r) => formatNumber(r.productCount), sortValue: (r) => r.productCount },
    {
      key: 'purchaseQuantity',
      header: 'Cantitate cumpărată',
      align: 'right',
      render: (r) => formatNumber(r.purchaseQuantity, 2),
      sortValue: (r) => r.purchaseQuantity,
    },
    {
      key: 'purchaseValue',
      header: 'Valoare cumpărată',
      align: 'right',
      render: (r) => formatLei(r.purchaseValue),
      sortValue: (r) => r.purchaseValue,
    },
    {
      key: 'salesQuantity',
      header: 'Cantitate vândută',
      align: 'right',
      render: (r) => formatNumber(r.salesQuantity, 2),
      sortValue: (r) => r.salesQuantity,
    },
    {
      key: 'salesValue',
      header: 'Valoare vândută',
      align: 'right',
      render: (r) => formatLei(r.salesValue),
      sortValue: (r) => r.salesValue,
    },
  ]

  const columns: DataTableColumn<ProductPriceSummary>[] = [
    {
      key: 'name',
      header: 'Produs',
      render: (r) => (
        <button className="text-left text-brand-700 hover:underline" onClick={() => setSelected(r)}>
          {r.product.name}
        </button>
      ),
      sortValue: (r) => r.product.name,
    },
    { key: 'supplier', header: 'Ultimul furnizor', render: (r) => r.lastSupplier ?? '—', sortValue: (r) => r.lastSupplier ?? '' },
    { key: 'last', header: 'Ultimul cost', align: 'right', render: (r) => (r.lastPrice != null ? formatLei(r.lastPrice) : '—'), sortValue: (r) => r.lastPrice ?? -1 },
    { key: 'prev', header: 'Cost anterior', align: 'right', render: (r) => (r.prevPrice != null ? formatLei(r.prevPrice) : '—'), sortValue: (r) => r.prevPrice ?? -1 },
    {
      key: 'diff',
      header: 'Diferență',
      align: 'right',
      render: (r) =>
        r.diffPct != null ? (
          <span className="inline-flex items-center gap-1.5">
            <AlertDot level={r.alertLevel} />
            {formatSignedPct(r.diffPct)} ({formatSignedLei(r.diffAbs ?? 0)})
          </span>
        ) : (
          '—'
        ),
      sortValue: (r) => r.diffPct ?? -Infinity,
    },
    { key: 'min', header: 'Preț minim istoric', align: 'right', render: (r) => (r.minPrice != null ? formatLei(r.minPrice) : '—'), sortValue: (r) => r.minPrice ?? -1 },
    { key: 'max', header: 'Preț maxim', align: 'right', render: (r) => (r.maxPrice != null ? formatLei(r.maxPrice) : '—'), sortValue: (r) => r.maxPrice ?? -1 },
    {
      key: 'avg',
      header: 'Preț mediu ponderat',
      align: 'right',
      render: (r) => (r.weightedAvgPrice != null ? formatLei(r.weightedAvgPrice) : '—'),
      sortValue: (r) => r.weightedAvgPrice ?? -1,
    },
    {
      key: 'vsAvg',
      header: 'Diferență vs. media istorică',
      align: 'right',
      render: (r) => (r.diffVsAvgPct != null ? formatSignedPct(r.diffVsAvgPct) : '—'),
      sortValue: (r) => r.diffVsAvgPct ?? -Infinity,
    },
    {
      key: 'qtyPurchased',
      header: 'Cantitate cumpărată',
      align: 'right',
      render: (r) => formatNumber(r.totalQuantityPurchased, 2),
      sortValue: (r) => r.totalQuantityPurchased,
    },
    {
      key: 'totalPurchased',
      header: 'Total cumpărat',
      align: 'right',
      render: (r) => formatLei(r.totalValuePurchased),
      sortValue: (r) => r.totalValuePurchased,
    },
  ]

  const hikes = summaries.filter((s) => s.alertLevel !== 'green')

  return (
    <div>
      <PageHeader
        title="Furnizori și evoluția prețurilor"
        description="Evoluția prețului de achiziție per produs, comparație între furnizori și scumpiri semnalate vizual."
      />

      {knownSuppliersPanel}

      {presetIds && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <span>Filtrat din alertă: {formatNumber(presetIds.length)} produse.</span>
          <button onClick={() => setPresetIds(null)} className="ml-auto rounded border border-brand-200 px-2 py-0.5 text-xs hover:bg-brand-100">
            Șterge filtrul
          </button>
        </div>
      )}

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Top Furnizori</h3>
          <select
            value={supplierMonth}
            onChange={(e) => setSupplierMonth(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
          >
            <option value="all">Toate lunile</option>
            {supplierMonthOptions.map((key) => (
              <option key={key} value={key}>
                {monthLabel(`${key}-01`)}
              </option>
            ))}
          </select>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Apasă pe un antet de coloană pentru a sorta după achiziții sau după vânzări. „Valoare vândută" atribuie
          vânzările fiecărui produs furnizorului lui cel mai recent (nu există un furnizor unic per produs în timp).
          {supplierMonth !== 'all' && ' Achizițiile și vânzările de mai jos sunt limitate la luna selectată.'}
        </p>
        <DataTable
          columns={supplierRankingColumns}
          rows={supplierRanking}
          rowKey={(r) => r.supplier}
          searchable
          searchPredicate={(r, q) => r.supplier.toLowerCase().includes(q)}
          defaultSortKey="purchaseValue"
          pageSize={15}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <Legend level="green" label="0–2% creștere" />
        <Legend level="yellow" label="2–5% creștere" />
        <Legend level="red" label="peste 5% creștere" />
        <span className="ml-auto text-slate-500">
          {hikes.length} produse cu creșteri de urmărit din {summaries.length} analizate
        </span>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable
          columns={columns}
          rows={displaySummaries}
          rowKey={(r) => r.product.id}
          searchable
          searchPredicate={(r, q) => r.product.name.toLowerCase().includes(q)}
          defaultSortKey="diff"
          pageSize={25}
        />
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Impact financiar al scumpirilor</h3>
        <p className="mb-3 text-xs text-slate-500">
          Estimare: (creșterea de preț pe unitate) × (cantitatea vândută în ultimele 30 zile, ca proxy pentru volumul
          actual). Nu este o previziune de achiziții viitoare.
        </p>
        {hikeImpacts.length === 0 ? (
          <p className="text-sm text-slate-400">Nicio scumpire cu impact estimabil în acest moment.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1.5">Produs</th>
                <th className="px-2 py-1.5 text-right">Scumpire</th>
                <th className="px-2 py-1.5 text-right">Volum lunar (estimat)</th>
                <th className="px-2 py-1.5 text-right">Impact estimat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {hikeImpacts.slice(0, 20).map((r) => (
                <tr key={r.summary.product.id}>
                  <td className="px-2 py-1.5">{r.summary.product.name}</td>
                  <td className="px-2 py-1.5 text-right">
                    {r.summary.diffPct != null ? formatSignedPct(r.summary.diffPct) : '—'} (
                    {formatSignedLei(r.summary.diffAbs ?? 0)})
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{formatNumber(r.monthlyVolumeEstimate, 2)} buc/lună</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-bad">
                    {formatSignedLei(r.hikeImpactPerMonth ?? 0)}/lună (estimat)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Economie teoretică — schimbare furnizor</h3>
        <p className="mb-3 text-xs text-slate-500">
          Ce s-ar economisi (estimat) dacă produsul ar fi cumpărat de la cel mai ieftin furnizor cunoscut, la volumul
          actual, în loc de furnizorul folosit ultima dată.
        </p>
        {savingOpportunities.length === 0 ? (
          <p className="text-sm text-slate-400">Nicio oportunitate de economie identificată — furnizorul folosit ultima dată e deja cel mai ieftin, pentru toate produsele cu istoric de la mai mulți furnizori.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1.5">Produs</th>
                <th className="px-2 py-1.5">Furnizor actual</th>
                <th className="px-2 py-1.5">Cel mai ieftin</th>
                <th className="px-2 py-1.5 text-right">Economie estimată</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {savingOpportunities.slice(0, 20).map((r) => (
                <tr key={r.summary.product.id}>
                  <td className="px-2 py-1.5">{r.summary.product.name}</td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {r.summary.lastSupplier} ({r.summary.lastPrice != null ? formatLei(r.summary.lastPrice) : '—'})
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">
                    {r.summary.bySupplier.find((s) => s.isCheapest)?.supplier} (
                    {formatLei(r.summary.bySupplier.find((s) => s.isCheapest)?.lastPrice ?? 0)})
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-good">
                    {formatLei(r.theoreticalMonthlySaving ?? 0)}/lună (estimat)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.product.name ?? ''} subtitle="Evoluția prețului de achiziție" wide>
        {selected && <ProductPriceDetail summary={selected} />}
      </Modal>
    </div>
  )
}

function Legend({ level, label }: { level: 'green' | 'yellow' | 'red'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      <AlertDot level={level} /> {label}
    </span>
  )
}

function ProductPriceDetail({ summary }: { summary: ProductPriceSummary }) {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ultimul cost" value={summary.lastPrice != null ? formatLei(summary.lastPrice) : '—'} />
        <Stat label="Cost anterior" value={summary.prevPrice != null ? formatLei(summary.prevPrice) : '—'} />
        <Stat label="Preț minim" value={summary.minPrice != null ? formatLei(summary.minPrice) : '—'} />
        <Stat label="Preț maxim" value={summary.maxPrice != null ? formatLei(summary.maxPrice) : '—'} />
        <Stat label="Preț mediu ponderat" value={summary.weightedAvgPrice != null ? formatLei(summary.weightedAvgPrice) : '—'} />
        <Stat label="Cantitate cumpărată" value={formatNumber(summary.totalQuantityPurchased, 2)} />
        <Stat label="Total cumpărat" value={formatLei(summary.totalValuePurchased)} />
      </div>

      <h4 className="mb-2 text-sm font-semibold text-slate-700">Grafic evoluție preț</h4>
      <TrendChart
        data={summary.history.map((h) => ({ date: h.date, value: h.price }))}
        color="#d97706"
        valueFormatter={(v) => formatLei(v)}
        height={180}
      />

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700">Comparație furnizori</h4>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-2 py-1.5">Furnizor</th>
            <th className="px-2 py-1.5 text-right">Ultimul preț</th>
            <th className="px-2 py-1.5 text-right">Ultima recepție</th>
            <th className="px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {summary.bySupplier.map((s) => (
            <tr key={s.supplier}>
              <td className="px-2 py-1.5">{s.supplier}</td>
              <td className="px-2 py-1.5 text-right">{formatLei(s.lastPrice)}</td>
              <td className="px-2 py-1.5 text-right text-slate-500">{formatDateRo(s.lastDate)}</td>
              <td className="px-2 py-1.5">
                {s.isCheapest && (
                  <span className="rounded-full bg-good/10 px-2 py-0.5 text-xs font-medium text-good">
                    Cel mai avantajos
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700">Istoric recepții</h4>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-2 py-1.5">Data</th>
            <th className="px-2 py-1.5">Furnizor</th>
            <th className="px-2 py-1.5 text-right">Preț</th>
            <th className="px-2 py-1.5 text-right">Diferență</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {[...summary.history].reverse().map((h, i) => (
            <tr key={i}>
              <td className="px-2 py-1.5">{formatDateRo(h.date)}</td>
              <td className="px-2 py-1.5">{h.supplier}</td>
              <td className="px-2 py-1.5 text-right">{formatLei(h.price)}</td>
              <td className="px-2 py-1.5 text-right">{h.diffPct != null ? formatSignedPct(h.diffPct) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-800">{value}</p>
    </div>
  )
}

// The station's own master list of supplier names — independent of what
// shows up from achiziții imports, so it can be set up before any receipt
// is ever imported. This is what Nomenclator's "Furnizor" field suggests
// from when typing by hand (via a datalist), so the same real supplier
// never ends up spelled three different ways across products.
function KnownSuppliersPanel({
  knownSuppliers,
  onSave,
}: {
  knownSuppliers: string[]
  onSave: (list: string[]) => Promise<void>
}) {
  const [bulkText, setBulkText] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [addedCount, setAddedCount] = useState<number | null>(null)

  const sorted = useMemo(() => [...knownSuppliers].sort((a, b) => a.localeCompare(b)), [knownSuppliers])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? sorted.filter((s) => s.toLowerCase().includes(q)) : sorted
  }, [sorted, query])

  async function handleBulkAdd() {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    const existingLower = new Set(knownSuppliers.map((s) => s.toLowerCase()))
    const toAdd: string[] = []
    for (const name of lines) {
      const key = name.toLowerCase()
      if (existingLower.has(key)) continue
      existingLower.add(key)
      toAdd.push(name)
    }
    setSaving(true)
    try {
      await onSave([...knownSuppliers, ...toAdd])
      setBulkText('')
      setAddedCount(toAdd.length)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(name: string) {
    await onSave(knownSuppliers.filter((s) => s !== name))
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Listă furnizori cunoscuți</h3>
      <p className="mb-3 text-xs text-slate-500">
        Lipește aici o listă de furnizori (câte un nume pe rând) — apare apoi ca sugestie când scrii un furnizor de
        mână în Nomenclator, dar poți oricând tasta și unul nou care nu e în listă.
      </p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          value={bulkText}
          onChange={(e) => { setBulkText(e.target.value); setAddedCount(null) }}
          placeholder={'Un furnizor pe rând, ex:\nACROPOLIS ACTIV SRL\nAIC MOLDOVA SRL\n...'}
          rows={4}
          className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          disabled={!bulkText.trim() || saving}
          onClick={handleBulkAdd}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Adaug...' : 'Adaugă în listă'}
        </button>
      </div>
      {addedCount != null && (
        <p className="mb-3 text-xs text-slate-500">
          {addedCount === 0 ? 'Toți furnizorii din text erau deja în listă.' : `${addedCount} furnizori noi adăugați.`}
        </p>
      )}

      {knownSuppliers.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Caută în listă..."
              className="w-full max-w-xs rounded-lg border border-slate-200 px-2 py-1 text-xs"
            />
            <span className="text-xs text-slate-400">{formatNumber(knownSuppliers.length)} furnizori</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-100 p-2 scrollbar-thin">
            <div className="flex flex-wrap gap-1.5">
              {filtered.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-xs text-slate-700"
                >
                  {s}
                  <button
                    onClick={() => handleRemove(s)}
                    title="Scoate din listă"
                    className="rounded-full px-1 text-slate-400 hover:bg-bad/10 hover:text-bad"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
