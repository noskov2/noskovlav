import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDataStore } from '@/store/dataStore'
import { computeReorderRecommendations, countProductsAwaitingSchedule, type ReorderRow } from '@/kpi/reorderRecommendations'
import { reportingEndStr } from '@/kpi/dateRanges'
import { updateSettings } from '@/data/repo/settings'
import { formatNumber } from '@/lib/format'
import { downloadReorderList } from '@/reports/reorderListWorkbook'

const LOOKBACK_DAYS = 28
// Date.getDay() order (0=Duminică) — matches kpi/dateRanges.ts's weekdayName
// and AppSettings.supplierDeliveryDays. Displayed Monday-first.
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAY_SHORT_LABELS: Record<number, string> = { 1: 'Lu', 2: 'Ma', 3: 'Mi', 4: 'Jo', 5: 'Vi', 6: 'Sâ', 0: 'Du' }

export function ReorderPage() {
  const { transactions, products, settings, refresh } = useDataStore()
  const asOfDate = reportingEndStr()

  const supplierNames = useMemo(() => {
    const set = new Set(settings?.knownSuppliers ?? [])
    for (const p of products) if (p.supplier) set.add(p.supplier)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [settings, products])

  const rows = useMemo(
    () => computeReorderRecommendations(products, transactions, settings?.supplierDeliveryDays ?? {}, asOfDate, LOOKBACK_DAYS),
    [products, transactions, settings, asOfDate],
  )
  const awaitingScheduleCount = useMemo(
    () => countProductsAwaitingSchedule(products, transactions, settings?.supplierDeliveryDays ?? {}, asOfDate, LOOKBACK_DAYS),
    [products, transactions, settings, asOfDate],
  )

  const bySupplier = useMemo(() => {
    const map = new Map<string, ReorderRow[]>()
    for (const row of rows) {
      const key = row.product.supplier
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Comenzi recomandate" />
        <EmptyState />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Comenzi recomandate"
        description="Câte bucăți probabil ai nevoie din fiecare produs până la următoarea livrare a furnizorului, pe baza vânzărilor din ultimele 4 săptămâni."
      />

      <DeliverySchedulePanel
        supplierNames={supplierNames}
        schedule={settings?.supplierDeliveryDays ?? {}}
        onSave={async (schedule) => {
          await updateSettings({ supplierDeliveryDays: schedule })
          await refresh()
        }}
      />

      {awaitingScheduleCount > 0 && (
        <p className="mb-5 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2 text-sm text-warn">
          {formatNumber(awaitingScheduleCount)} produse cu vânzări recente au un furnizor fără program de livrare
          configurat mai sus — nu apar în recomandările de mai jos până nu le setezi ziua de livrare.
        </p>
      )}

      {bySupplier.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Niciun produs nu are nevoie de comandă în acest moment — fie stocul curent acoperă până la următoarea
          livrare, fie niciun furnizor nu are încă un program de livrare configurat mai sus.
        </p>
      ) : (
        <div className="space-y-5">
          {bySupplier.map(([supplier, supplierRows]) => (
            <div key={supplier} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">
                  {supplier} <span className="font-normal text-slate-400">— {formatNumber(supplierRows.length)} produse</span>
                </h3>
                <button
                  onClick={() => downloadReorderList(supplier, supplierRows)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  ⬇ Exportă lista de comandă
                </button>
              </div>
              <ul className="space-y-2 text-sm">
                {supplierRows.map((row) => (
                  <li key={row.product.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-slate-700">
                    {row.note}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeliverySchedulePanel({
  supplierNames,
  schedule,
  onSave,
}: {
  supplierNames: string[]
  schedule: Record<string, number[]>
  onSave: (schedule: Record<string, number[]>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? supplierNames.filter((s) => s.toLowerCase().includes(q)) : supplierNames
  }, [supplierNames, query])

  async function toggleDay(supplier: string, day: number) {
    const current = schedule[supplier] ?? []
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    await onSave({ ...schedule, [supplier]: next })
  }

  if (supplierNames.length === 0) {
    return (
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Program livrări pe furnizor</h3>
        <p className="text-xs text-slate-500">
          Niciun furnizor încă — adaugă furnizori în pagina Furnizori & Prețuri sau completează câmpul „Furnizor” pe
          produse în Nomenclator, apoi revino aici pentru a le seta ziua de livrare.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Program livrări pe furnizor</h3>
      <p className="mb-3 text-xs text-slate-500">
        Bifează ziua/zilele din săptămână în care fiecare furnizor livrează. Fără o zi setată, furnizorul respectiv nu
        apare în recomandările de comandă de mai jos.
      </p>
      {supplierNames.length > 6 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caută furnizor..."
          className="mb-3 w-full max-w-xs rounded-lg border border-slate-200 px-2 py-1 text-xs"
        />
      )}
      <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-100 text-xs">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="px-2 py-1.5">Furnizor</th>
              {WEEKDAYS.map((d) => (
                <th key={d} className="px-1.5 py-1.5 text-center">
                  {WEEKDAY_SHORT_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((supplier) => (
              <tr key={supplier}>
                <td className="px-2 py-1.5 text-slate-700">{supplier}</td>
                {WEEKDAYS.map((d) => (
                  <td key={d} className="px-1.5 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={(schedule[supplier] ?? []).includes(d)}
                      onChange={() => toggleDay(supplier, d)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
