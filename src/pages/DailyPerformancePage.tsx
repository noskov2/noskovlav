import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { DrillValue } from '@/components/ui/DrillValue'
import { Modal } from '@/components/ui/Modal'
import { TrendChart } from '@/components/charts/TrendChart'
import { FilterBar } from '@/components/filters/FilterBar'
import { useDataStore } from '@/store/dataStore'
import { useFilterStore } from '@/store/filterStore'
import { effectiveRange } from '@/kpi/filterState'
import { computeDayDetail, computeDayComparisons, COMPARISON_METRIC_LABELS, type ComparisonMetricKey } from '@/kpi/dailyPerformance'
import { computeDailySeries } from '@/kpi/dailySeries'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'
import { computePromoLineLabels } from '@/kpi/promoLines'
import { computeFuelBreakdown, resolveFuelTypeIds, FUEL_TYPE_LABELS, type FuelTypeKey } from '@/kpi/fuelVariants'
import { BAKERY_WATCHLIST, matchWatchlistItem, computeWatchlistRows } from '@/kpi/watchlist'
import { filterByRange } from '@/kpi/applyFilters'
import { HourlyHeatmap } from '@/components/charts/Heatmap'
import { formatDateRo, formatLei, formatNumber, formatPct, formatSignedLei, formatSignedPct } from '@/lib/format'
import { addDays, weekdayName } from '@/kpi/dateRanges'

const METRICS: ComparisonMetricKey[] = [
  'totalSales',
  'goodsSales',
  'fuelSales',
  'receiptCount',
  'avgReceiptValue',
  'coffeeCount',
  'sandwichCount',
  'crossSellPct',
  'grossProfitEstimate',
  'promoValue',
  'totalLiters',
]

function formatMetric(key: ComparisonMetricKey, value: number): string {
  if (key === 'receiptCount' || key === 'coffeeCount' || key === 'sandwichCount') return formatNumber(value)
  if (key === 'crossSellPct') return formatPct(value)
  if (key === 'totalLiters') return `${formatNumber(value, 0)} L`
  return formatLei(value)
}

type ViewMode = 'total' | 1 | 2 | string // string = cashierId

export function DailyPerformancePage() {
  const { transactions, products, cashiers } = useDataStore()
  const { filter } = useFilterStore()
  const range = effectiveRange(filter)

  const lastDate = useMemo(() => {
    if (transactions.length === 0) return ''
    return transactions.reduce((max, t) => (t.date > max ? t.date : max), transactions[0].date)
  }, [transactions])

  const [selectedDate, setSelectedDate] = useState(lastDate)
  const [view, setView] = useState<ViewMode>('total')

  const date = selectedDate || lastDate

  const dayTransactions = useMemo(() => transactions.filter((t) => t.date === date), [transactions, date])
  const detail = useMemo(
    () => computeDayDetail(date, dayTransactions, products, cashiers),
    [date, dayTransactions, products, cashiers],
  )

  const viewTransactions = useMemo(() => {
    if (view === 'total') return dayTransactions
    if (view === 1 || view === 2) return dayTransactions.filter((t) => t.shift === view)
    return dayTransactions.filter((t) => t.cashierId === view)
  }, [dayTransactions, view])

  const viewSummary = useMemo(() => {
    if (view === 'total') return detail.total
    if (view === 1 || view === 2) return detail.byShift[view]
    return detail.byCashier.find((c) => c.cashier.id === view)?.summary
  }, [view, detail])

  const fuelIds = useMemo(() => fuelProductIds(products), [products])
  const fuelTypeIds = useMemo(() => resolveFuelTypeIds(products), [products])
  const fuelBreakdown = useMemo(() => computeFuelBreakdown(viewTransactions, products), [viewTransactions, products])
  const fuelTypeRows = (['motorina', 'benzina', 'gpl', 'altul'] as FuelTypeKey[]).filter(
    (k) => fuelBreakdown[k].quantity > 0 || fuelBreakdown[k].value > 0,
  )
  const coffeeIds = useMemo(() => productIdsInGroup(products, 'cafea'), [products])
  const sandwichIds = useMemo(() => productIdsInGroup(products, 'sandwich'), [products])
  const vitrinaIds = useMemo(() => productIdsInGroup(products, 'dulciuriVitrina'), [products])
  const lemonadeIds = useMemo(() => productIdsInGroup(products, 'limonadaCeai'), [products])
  const promoLabelsById = useMemo(() => computePromoLineLabels(viewTransactions, products), [viewTransactions, products])
  const promoLines = useMemo(
    () => viewTransactions.filter((t) => promoLabelsById.has(t.id)),
    [viewTransactions, promoLabelsById],
  )

  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetricKey>('totalSales')
  const comparisons = useMemo(
    () => (date ? computeDayComparisons(date, comparisonMetric, range, transactions, products) : null),
    [date, comparisonMetric, range, transactions, products],
  )

  const dailySeries = useMemo(() => computeDailySeries(transactions, products, range), [transactions, products, range])

  // Fixed patiserie/cafenea watchlist — coffees come from the trusted
  // Nomenclator 'cafea' group tag; everything else is matched by name
  // against the real product list (never invented — unmatched or ambiguous
  // items are left for the user to resolve via the dropdown).
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const categoryOptions = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(),
    [products],
  )
  const [dayCategory, setDayCategory] = useState('')
  const categoryLines = useMemo(
    () =>
      dayCategory
        ? viewTransactions.filter((t) => (productsById.get(t.productId)?.category || t.categoryRaw) === dayCategory)
        : [],
    [viewTransactions, dayCategory, productsById],
  )
  const categoryTotal = useMemo(
    () => ({
      value: categoryLines.reduce((s, t) => s + t.value, 0),
      quantity: categoryLines.reduce((s, t) => s + t.quantity, 0),
      receiptCount: new Set(categoryLines.map((t) => `${t.date}::${t.receiptNo}::${t.cashierId}`)).size,
    }),
    [categoryLines],
  )
  const productsSortedByName = useMemo(() => products.slice().sort((a, b) => a.name.localeCompare(b.name)), [products])
  const coffeeProducts = useMemo(
    () => products.filter((p) => coffeeIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [products, coffeeIds],
  )
  const watchlistItemInputs = useMemo(() => {
    const coffeeItems = coffeeProducts.map((p) => ({ key: `cafea-${p.id}`, label: p.name, autoProductId: p.id as string | null }))
    const bakeryItems = BAKERY_WATCHLIST.map((item) => ({
      key: item.id,
      label: item.label,
      autoProductId: matchWatchlistItem(products, item),
    }))
    return [...coffeeItems, ...bakeryItems]
  }, [coffeeProducts, products])

  const [watchlistOverrides, setWatchlistOverrides] = useState<Record<string, string>>({})
  const [watchlistOpen, setWatchlistOpen] = useState(false)

  const watchlistRowInputs = useMemo(
    () =>
      watchlistItemInputs.map(({ key, label, autoProductId }) => {
        const overrideId = watchlistOverrides[key]
        const productId = overrideId !== undefined ? overrideId || null : autoProductId
        return { key, label, product: productId ? (productsById.get(productId) ?? null) : null }
      }),
    [watchlistItemInputs, watchlistOverrides, productsById],
  )

  const watchlistLast7Start = date ? addDays(date, -7) : ''
  const watchlistLast7End = date ? addDays(date, -1) : ''
  const watchlistWindowTx = useMemo(
    () => (date ? filterByRange(transactions, watchlistLast7Start, date) : []),
    [transactions, watchlistLast7Start, date],
  )
  const watchlistRows = useMemo(
    () => computeWatchlistRows(watchlistWindowTx, watchlistRowInputs, date, watchlistLast7Start, watchlistLast7End),
    [watchlistWindowTx, watchlistRowInputs, date, watchlistLast7Start, watchlistLast7End],
  )

  if (transactions.length === 0) {
    return (
      <div>
        <PageHeader title="Cum a mers stația în fiecare zi" />
        <EmptyState />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Cum a mers stația în fiecare zi"
        description="Alege o zi din calendar și vezi exact cum a mers stația — total, pe tură și pe casier."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Ziua selectată</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
        <span className="text-sm font-medium text-slate-700">{date && weekdayName(date)}</span>

        <div className="ml-auto flex flex-wrap gap-1">
          <ViewButton active={view === 'total'} onClick={() => setView('total')}>
            Total zi
          </ViewButton>
          <ViewButton active={view === 1} onClick={() => setView(1)} disabled={!detail.byShift[1]}>
            Tura 1
          </ViewButton>
          <ViewButton active={view === 2} onClick={() => setView(2)} disabled={!detail.byShift[2]}>
            Tura 2
          </ViewButton>
          <select
            value={typeof view === 'string' && view !== 'total' ? view : ''}
            onChange={(e) => setView(e.target.value || 'total')}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
          >
            <option value="">Casier...</option>
            {detail.byCashier.map((c) => (
              <option key={c.cashier.id} value={c.cashier.id}>
                {c.cashier.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!viewSummary ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          Nu există date pentru această selecție.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            <KpiCard
              label="Vânzări totale"
              value={<DrillValue title="Vânzări totale" lines={viewTransactions}>{formatLei(viewSummary.totalSales)}</DrillValue>}
            />
            <KpiCard
              label="Vânzări marfă"
              value={
                <DrillValue title="Vânzări marfă" lines={viewTransactions.filter((t) => !fuelIds.has(t.productId))}>
                  {formatLei(viewSummary.goodsSales)}
                </DrillValue>
              }
            />
            <KpiCard
              label="Vânzări carburant"
              value={
                <DrillValue title="Vânzări carburant" lines={viewTransactions.filter((t) => fuelIds.has(t.productId))}>
                  {formatLei(viewSummary.fuelSales)}
                </DrillValue>
              }
              hint={`${formatNumber(viewSummary.fuelLiters)} litri${viewSummary.gplLiters > 0 ? ` · GPL ${formatNumber(viewSummary.gplLiters)} L` : ''}`}
            />
            <KpiCard label="Bonuri" value={formatNumber(viewSummary.receiptCount)} />
            <KpiCard label="Bon mediu" value={formatLei(viewSummary.avgReceiptValue)} />
            <KpiCard
              label="Cafele"
              value={
                <DrillValue title="Cafele" lines={viewTransactions.filter((t) => coffeeIds.has(t.productId))}>
                  {formatNumber(viewSummary.coffeeCount)}
                </DrillValue>
              }
            />
            <KpiCard
              label="Sandwich-uri"
              value={
                <DrillValue title="Sandwich-uri" lines={viewTransactions.filter((t) => sandwichIds.has(t.productId))}>
                  {formatNumber(viewSummary.sandwichCount)}
                </DrillValue>
              }
            />
            <KpiCard
              label="Dulciuri vitrină"
              value={
                <DrillValue title="Dulciuri vitrină" lines={viewTransactions.filter((t) => vitrinaIds.has(t.productId))}>
                  {formatNumber(viewSummary.vitrinaCount)}
                </DrillValue>
              }
            />
            <KpiCard
              label="Limonade/ceai"
              value={
                <DrillValue title="Limonade/ceai" lines={viewTransactions.filter((t) => lemonadeIds.has(t.productId))}>
                  {formatNumber(viewSummary.lemonadeCount)}
                </DrillValue>
              }
            />
            <KpiCard label="Cross-sell" value={formatPct(viewSummary.crossSellPct)} />
            <KpiCard
              label="Profit brut estimat"
              value={formatLei(viewSummary.grossProfitEstimate)}
              tone={viewSummary.grossProfitEstimate >= 0 ? 'good' : 'bad'}
              hint={
                viewSummary.grossProfitKnownShare < 0.99
                  ? `${formatPct(viewSummary.grossProfitKnownShare * 100, 0)} din vânzări au preț de achiziție cunoscut`
                  : undefined
              }
            />
            <KpiCard label="Litri" value={`${formatNumber(viewSummary.totalLiters, 0)} L`} />
            <KpiCard
              label="Promoții"
              value={
                <DrillValue title="Vânzări prin promoții" lines={promoLines}>
                  {formatLei(viewSummary.promoValue)}
                </DrillValue>
              }
              hint={`${formatNumber(viewSummary.promoCount)} linii`}
            />
          </div>

          {fuelTypeRows.length > 0 && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Combustibil pe tip</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-1.5">Tip</th>
                      <th className="px-2 py-1.5 text-right">Cantitate</th>
                      <th className="px-2 py-1.5 text-right">Valoare</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {fuelTypeRows.map((key) => (
                      <tr key={key}>
                        <td className="px-2 py-1.5 font-medium text-slate-800">{FUEL_TYPE_LABELS[key]}</td>
                        <td className="px-2 py-1.5 text-right">
                          <DrillValue
                            title={`${FUEL_TYPE_LABELS[key]} — cantitate`}
                            lines={viewTransactions.filter((t) => fuelTypeIds[key].has(t.productId))}
                          >
                            {formatNumber(fuelBreakdown[key].quantity, 0)} L
                          </DrillValue>
                        </td>
                        <td className="px-2 py-1.5 text-right">{formatLei(fuelBreakdown[key].value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">Vânzări pe categorie</h3>
              <select
                value={dayCategory}
                onChange={(e) => setDayCategory(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="">Alege o categorie...</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {dayCategory ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">Valoare vândută</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900">
                    <DrillValue title={`${dayCategory} — ${formatDateRo(date)}`} lines={categoryLines}>
                      {formatLei(categoryTotal.value)}
                    </DrillValue>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">Cantitate</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatNumber(categoryTotal.quantity, 2)}</p>
                </div>
                <div className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">Bonuri cu produse din categorie</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900">{formatNumber(categoryTotal.receiptCount)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Alege o categorie ca să vezi cât s-a vândut din ea {view === 'total' ? 'în ziua selectată' : 'pentru selecția curentă (tură/casier)'}.
              </p>
            )}
          </div>

          {view === 'total' && detail.byCashier.length > 0 && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Vânzări pe casier</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-1.5">Casier</th>
                      <th className="px-2 py-1.5 text-right">Vânzări</th>
                      <th className="px-2 py-1.5 text-right">Bonuri</th>
                      <th className="px-2 py-1.5 text-right">Bon mediu</th>
                      <th className="px-2 py-1.5 text-right">Cross-sell</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detail.byCashier.map((c) => (
                      <tr key={c.cashier.id} className="hover:bg-slate-50">
                        <td className="px-2 py-1.5">
                          <button className="text-brand-700 hover:underline" onClick={() => setView(c.cashier.id)}>
                            {c.cashier.name}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-right">{formatLei(c.summary.totalSales)}</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(c.summary.receiptCount)}</td>
                        <td className="px-2 py-1.5 text-right">{formatLei(c.summary.avgReceiptValue)}</td>
                        <td className="px-2 py-1.5 text-right">{formatPct(c.summary.crossSellPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Patiserie & cafenea</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {watchlistRows.length} produse urmărite — cât s-a vândut din fiecare
              {date ? ` pe ${formatDateRo(date)}` : ''} față de media ultimelor 7 zile (
              {watchlistLast7Start && formatDateRo(watchlistLast7Start)} – {watchlistLast7End && formatDateRo(watchlistLast7End)}).
            </p>
          </div>
          <button
            onClick={() => setWatchlistOpen(true)}
            disabled={!date}
            className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Deschide
          </button>
        </div>
      </div>

      <Modal
        open={watchlistOpen}
        onClose={() => setWatchlistOpen(false)}
        title="Patiserie & cafenea — comparație cu ultimele 7 zile"
        subtitle={
          date
            ? `${formatDateRo(date)} vs. media ${formatDateRo(watchlistLast7Start)} – ${formatDateRo(watchlistLast7End)}`
            : undefined
        }
        wide
      >
        <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Produs urmărit</th>
                <th className="px-3 py-2">Produs în Nomenclator</th>
                <th className="px-3 py-2 text-right">Azi</th>
                <th className="px-3 py-2 text-right">Ultimele 7 zile</th>
                <th className="px-3 py-2 text-right">Medie/zi (7 zile)</th>
                <th className="px-3 py-2 text-right">Diferență</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {watchlistRows.map((r) => {
                const product = r.product
                return (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{r.label}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={product?.id ?? ''}
                        onChange={(e) => setWatchlistOverrides((prev) => ({ ...prev, [r.key]: e.target.value }))}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          product ? 'border-slate-200 text-slate-700' : 'border-bad/50 text-bad'
                        }`}
                      >
                        <option value="">— negăsit, alege manual —</option>
                        {productsSortedByName.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-700">
                      {product ? (
                        <DrillValue title={`${r.label} — azi`} lines={dayTransactions.filter((t) => t.productId === product.id)}>
                          {formatNumber(r.todayQty, 2)}
                        </DrillValue>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-700">{product ? formatNumber(r.last7Qty, 2) : '—'}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700">{product ? formatNumber(r.last7AvgQty, 2) : '—'}</td>
                    <td className="px-3 py-1.5 text-right">
                      {r.diffPct != null ? (
                        <span className={`font-medium ${r.diffPct >= 0 ? 'text-good' : 'text-bad'}`}>{formatSignedPct(r.diffPct)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Modal>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Comparații — ziua selectată vs. repere</h3>
          <select
            value={comparisonMetric}
            onChange={(e) => setComparisonMetric(e.target.value as ComparisonMetricKey)}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {COMPARISON_METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        {comparisons && (
          <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {COMPARISON_METRIC_LABELS[comparisonMetric]} — {formatDateRo(date)}
            </p>
            <p className="mt-0.5 text-2xl font-semibold text-slate-900">
              {formatMetric(comparisonMetric, comparisons.value)}
            </p>
          </div>
        )}
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {comparisons &&
            [
              comparisons.vsPeriodAvg,
              comparisons.vsWeekdayAvg,
              comparisons.vsLast4SimilarAvg,
              comparisons.vsLast30Avg,
              comparisons.vsMonthAvg,
            ].map(
              (p) => (
                <div key={p.label} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">{p.label}</p>
                  <p className="mt-0.5 text-base font-semibold text-slate-800">
                    {formatMetric(comparisonMetric, p.value)}
                  </p>
                  {p.diffPct != null && (
                    <p className={`mt-0.5 text-xs font-medium ${p.diffAbs >= 0 ? 'text-good' : 'text-bad'}`}>
                      {formatSignedPct(p.diffPct)} ({formatSignedLei(p.diffAbs)})
                    </p>
                  )}
                </div>
              ),
            )}
        </div>

        <h3 className="mb-2 text-sm font-semibold text-slate-700">Evoluție în timp — Vânzări totale (perioada filtrată)</h3>
        <FilterBar hideCashier hideShift hideCategory hideProduct />
        <div className="mt-3">
          <TrendChart data={dailySeries.map((p) => ({ date: p.date, value: p.summary.totalSales }))} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <HourlyHeatmap transactions={transactions} products={products} range={range} />
      </div>
    </div>
  )
}

function ViewButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
