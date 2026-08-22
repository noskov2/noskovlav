import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/filters/FilterBar'
import { Tabs } from '@/components/ui/Tabs'
import { DrillValue } from '@/components/ui/DrillValue'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { filterTransactions } from '@/kpi/applyFilters'
import { computeReceiptAnalysis, RECEIPT_BUCKET_LABELS, type ReceiptBucketKey } from '@/kpi/receiptAnalysis'
import { computeBasketAnalysis } from '@/kpi/basketAnalysis'
import { formatLei, formatNumber, formatPct } from '@/lib/format'

const BUCKET_ORDER: ReceiptBucketKey[] = ['toate', 'doarCarburant', 'doarMarfa', 'carburantSiMarfa']

const TABS = [
  { key: 'bonuri', label: 'Bonuri' },
  { key: 'basket', label: 'Basket (produse cumpărate împreună)' },
]

export function ReceiptsPage() {
  const { transactions, products, cashiersById, productsById } = useDataStore()
  const { filter } = useFilterStore()
  const [tab, setTab] = useState('bonuri')

  const filtered = useMemo(
    () => filterTransactions(transactions, filter, productsById, cashiersById),
    [transactions, filter, productsById, cashiersById],
  )

  const analysis = useMemo(() => computeReceiptAnalysis(filtered, products), [filtered, products])
  const baskets = useMemo(() => computeBasketAnalysis(filtered, products), [filtered, products])

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Vânzări & Bonuri" />
        <EmptyState />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Vânzări & Bonuri"
        description="Structura bonurilor — câte produse/categorii pe bon, marfă/bon carburant — și ce produse se cumpără împreună."
      />
      <div className="mb-5">
        <FilterBar hideCategory hideProduct />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === 'bonuri' && (
            <div>
              <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
                Marfă/bon carburant (medie pe toate bonurile cu carburant, indiferent dacă au avut și marfă):{' '}
                <span className="font-semibold">{formatLei(analysis.avgGoodsValuePerFuelReceipt)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {BUCKET_ORDER.map((key) => {
                  const s = analysis.buckets[key]
                  return (
                    <div key={key} className="rounded-xl border border-slate-200 p-4">
                      <h3 className="mb-2 text-sm font-semibold text-slate-800">{RECEIPT_BUCKET_LABELS[key]}</h3>
                      <dl className="space-y-1 text-sm">
                        <Row label="Bonuri" value={formatNumber(s.receiptCount)} />
                        <Row label="Bon mediu" value={formatLei(s.avgReceiptValue)} />
                        <Row label="Produse/bon" value={formatNumber(s.avgProductsPerReceipt, 2)} />
                        <Row label="Categorii/bon" value={formatNumber(s.avgCategoriesPerReceipt, 2)} />
                        <Row label="Marfă/bon" value={formatLei(s.avgGoodsValuePerReceipt)} />
                      </dl>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'basket' && (
            <div>
              <p className="mb-4 text-sm text-slate-500">
                Attachment rate = % din bonurile categoriei de bază care conțin și cealaltă categorie.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-1.5">Combinație</th>
                      <th className="px-2 py-1.5 text-right">Bonuri cu categoria de bază</th>
                      <th className="px-2 py-1.5 text-right">Bonuri comune</th>
                      <th className="px-2 py-1.5 text-right">Attachment rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {baskets.map((b) => (
                      <tr key={b.key}>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{b.label}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">
                          {formatNumber(b.baseReceipts)} ({b.baseLabel})
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <DrillValue title={`${b.label} — bonuri comune`} lines={b.commonLines}>
                            {formatNumber(b.commonReceipts)}
                          </DrillValue>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-slate-900">{formatPct(b.attachmentRatePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}
