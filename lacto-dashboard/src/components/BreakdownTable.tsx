import { useMemo, useState } from 'react'
import type { ComparedRow } from '../analytics/compare'
import { formatCurrency, formatNumber, formatPercent, formatQuantity } from '../lib/ro-format'

type SortKey = 'name' | 'value' | 'quantity' | 'count' | 'distinctClients' | 'distinctProducts' | 'avgPrice' | 'share' | 'diffValue' | 'diffPercent'

interface Props {
  rows: ComparedRow[]
  nameLabel: string
  showClients?: boolean
  showProducts?: boolean
  showComparison?: boolean
  /** Coloane opționale (implicit toate afișate) — folosite de Generatorul de rapoarte pentru comutarea indicatorilor. */
  showValue?: boolean
  showQuantity?: boolean
  showCount?: boolean
  showAvgPrice?: boolean
  showShare?: boolean
  showDiffValue?: boolean
  extraColumn?: { label: string; render: (row: ComparedRow) => string }
  /** Când e setat, denumirea devine link (ex. spre profilul Client 360°/Produs 360°). */
  onRowClick?: (row: ComparedRow) => void
}

function SortableHeader({
  label,
  k,
  align = 'right',
  activeKey,
  dir,
  onToggle,
}: {
  label: string
  k: SortKey
  align?: 'left' | 'right'
  activeKey: SortKey
  dir: 1 | -1
  onToggle: (k: SortKey) => void
}) {
  return (
    <th
      className={`px-3 py-2 font-medium cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onToggle(k)}
    >
      {label}
      {activeKey === k && <span className="text-slate-400"> {dir === -1 ? '▼' : '▲'}</span>}
    </th>
  )
}

/** Tabel sortabil/filtrabil reutilizat de rapoartele pe dimensiune (Canale, Categorii, Clienți, Produse — spec §16, §35). */
export function BreakdownTable({
  rows,
  nameLabel,
  showClients,
  showProducts,
  showComparison,
  showValue = true,
  showQuantity = true,
  showCount = true,
  showAvgPrice = true,
  showShare = true,
  showDiffValue = false,
  extraColumn,
  onRowClick,
}: Props) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  const filtered = useMemo(() => rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase())), [rows, search])

  const sorted = useMemo(() => {
    const withAvg = filtered.map((r) => ({ ...r, avgPrice: r.quantity > 0 ? r.value / r.quantity : 0 }))
    return withAvg.sort((a, b) => {
      const av = sortKey === 'name' ? a.name : (a[sortKey] ?? -Infinity)
      const bv = sortKey === 'name' ? b.name : (b[sortKey] ?? -Infinity)
      if (typeof av === 'string' || typeof bv === 'string') return sortDir * String(av).localeCompare(String(bv), 'ro')
      return sortDir * ((av as number) - (bv as number))
    })
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === -1 ? 1 : -1))
    else {
      setSortKey(key)
      setSortDir(-1)
    }
  }

  return (
    <div>
      <input
        className="border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mb-3 w-full max-w-xs"
        placeholder={`Caută ${nameLabel.toLowerCase()}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
            <tr>
              <SortableHeader label={nameLabel} k="name" align="left" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />
              {extraColumn && <th className="px-3 py-2 text-left font-medium">{extraColumn.label}</th>}
              {showValue && <SortableHeader label="Valoare" k="value" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showQuantity && <SortableHeader label="Cantitate" k="quantity" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showCount && <SortableHeader label="Tranzacții" k="count" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showClients && <SortableHeader label="Clienți" k="distinctClients" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showProducts && <SortableHeader label="Produse" k="distinctProducts" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showAvgPrice && <SortableHeader label="Preț mediu" k="avgPrice" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showShare && <SortableHeader label="Pondere" k="share" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showDiffValue && <SortableHeader label="Diferență" k="diffValue" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
              {showComparison && <SortableHeader label="Diferență %" k="diffPercent" activeKey={sortKey} dir={sortDir} onToggle={toggleSort} />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.id}-${r.name}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-1.5">
                  {onRowClick && r.id !== null ? (
                    <button className="text-emerald-700 dark:text-emerald-400 hover:underline text-left" onClick={() => onRowClick(r)}>
                      {r.name}
                    </button>
                  ) : (
                    r.name
                  )}
                </td>
                {extraColumn && <td className="px-3 py-1.5 text-slate-500">{extraColumn.render(r)}</td>}
                {showValue && <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatCurrency(r.value)}</td>}
                {showQuantity && <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatQuantity(r.quantity)}</td>}
                {showCount && <td className="px-3 py-1.5 text-right">{formatNumber(r.count)}</td>}
                {showClients && <td className="px-3 py-1.5 text-right">{formatNumber(r.distinctClients)}</td>}
                {showProducts && <td className="px-3 py-1.5 text-right">{formatNumber(r.distinctProducts)}</td>}
                {showAvgPrice && (
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">{r.quantity > 0 ? formatCurrency(r.value / r.quantity) : '—'}</td>
                )}
                {showShare && <td className="px-3 py-1.5 text-right">{r.share.toFixed(1)}%</td>}
                {showDiffValue && (
                  <td
                    className={`px-3 py-1.5 text-right whitespace-nowrap ${
                      r.diffValue === null ? 'text-slate-400' : r.diffValue > 0 ? 'text-emerald-600 dark:text-emerald-400' : r.diffValue < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                    }`}
                  >
                    {r.diffValue === null ? '—' : formatCurrency(r.diffValue)}
                  </td>
                )}
                {showComparison && (
                  <td
                    className={`px-3 py-1.5 text-right whitespace-nowrap ${
                      r.diffPercent === null ? 'text-slate-400' : r.diffPercent > 0 ? 'text-emerald-600 dark:text-emerald-400' : r.diffPercent < 0 ? 'text-rose-600 dark:text-rose-400' : ''
                    }`}
                  >
                    {formatPercent(r.diffPercent)}
                  </td>
                )}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-slate-400">
                  Niciun rezultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
