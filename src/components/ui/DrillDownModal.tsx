import { useState } from 'react'
import { useDrillDownStore } from '@/store/drillDownStore'
import { useDataStore } from '@/store/dataStore'
import { Modal } from '@/components/ui/Modal'
import { formatDateRo, formatLei, formatNumber } from '@/lib/format'

type SortKey = 'date' | 'cashier' | 'product' | 'quantity' | 'value'

export function DrillDownModal() {
  const { open, title, subtitle, lines, close } = useDrillDownStore()
  const { productsById, cashiersById } = useDataStore()
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = [...lines].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'date':
        cmp = a.timestamp - b.timestamp
        break
      case 'cashier':
        cmp = (cashiersById.get(a.cashierId)?.name ?? '').localeCompare(cashiersById.get(b.cashierId)?.name ?? '')
        break
      case 'product':
        cmp = a.productRaw.localeCompare(b.productRaw)
        break
      case 'quantity':
        cmp = a.quantity - b.quantity
        break
      case 'value':
        cmp = a.value - b.value
        break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalValue = lines.reduce((s, l) => s + l.value, 0)
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const th = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
    >
      {label} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <Modal open={open} onClose={close} title={title} subtitle={subtitle} wide>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>
          <strong className="text-slate-900">{formatNumber(lines.length)}</strong> tranzacții
        </span>
        <span>
          Cantitate totală: <strong className="text-slate-900">{formatNumber(totalQty, 2)}</strong>
        </span>
        <span>
          Valoare totală: <strong className="text-slate-900">{formatLei(totalValue)}</strong>
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Nu există tranzacții pentru această selecție.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {th('date', 'Data')}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Oră</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Bon</th>
                {th('cashier', 'Casier')}
                {th('product', 'Produs')}
                {th('quantity', 'Cantitate')}
                {th('value', 'Valoare')}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{formatDateRo(l.date)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{l.time}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{l.receiptNo}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                    {cashiersById.get(l.cashierId)?.name ?? l.cashierRaw}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700">
                    {productsById.get(l.productId)?.name ?? l.productRaw}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-700">
                    {formatNumber(l.quantity, 2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-900">
                    {formatLei(l.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
