import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { AlertDot } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { TrendChart } from '@/components/charts/TrendChart'
import { useDataStore } from '@/store/dataStore'
import { computeProductPriceSummaries, type ProductPriceSummary } from '@/kpi/suppliers'
import { formatDateRo, formatLei, formatSignedLei, formatSignedPct } from '@/lib/format'

export function SuppliersPage() {
  const { supplierReceipts, products } = useDataStore()
  const [selected, setSelected] = useState<ProductPriceSummary | null>(null)

  const summaries = useMemo(() => computeProductPriceSummaries(supplierReceipts, products), [supplierReceipts, products])

  if (supplierReceipts.length === 0) {
    return (
      <div>
        <PageHeader title="Furnizori și evoluția prețurilor" />
        <EmptyState
          icon="🚚"
          title="Nicio achiziție încărcată încă"
          description="Mergi la Import date → Achiziții/Furnizori pentru a încărca exportul de recepții/facturi de la furnizori (produs, furnizor, dată, cantitate, preț)."
        />
      </div>
    )
  }

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
    { key: 'avg', header: 'Preț mediu', align: 'right', render: (r) => (r.avgPrice != null ? formatLei(r.avgPrice) : '—'), sortValue: (r) => r.avgPrice ?? -1 },
    {
      key: 'vsAvg',
      header: 'Diferență vs. media istorică',
      align: 'right',
      render: (r) => (r.diffVsAvgPct != null ? formatSignedPct(r.diffVsAvgPct) : '—'),
      sortValue: (r) => r.diffVsAvgPct ?? -Infinity,
    },
  ]

  const hikes = summaries.filter((s) => s.alertLevel !== 'green')

  return (
    <div>
      <PageHeader
        title="Furnizori și evoluția prețurilor"
        description="Evoluția prețului de achiziție per produs, comparație între furnizori și scumpiri semnalate vizual."
      />

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <Legend level="green" label="0–2% creștere" />
        <Legend level="yellow" label="2–5% creștere" />
        <Legend level="red" label="peste 5% creștere" />
        <span className="ml-auto text-slate-500">
          {hikes.length} produse cu creșteri de urmărit din {summaries.length} analizate
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable
          columns={columns}
          rows={summaries}
          rowKey={(r) => r.product.id}
          searchable
          searchPredicate={(r, q) => r.product.name.toLowerCase().includes(q)}
          defaultSortKey="diff"
          pageSize={25}
        />
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
