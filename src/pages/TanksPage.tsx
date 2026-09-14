import { useCallback, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { MultiLineChart } from '@/components/charts/MultiLineChart'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend as RLegend,
} from 'recharts'
import { useDataStore } from '@/store/dataStore'
import { updateSettings } from '@/data/repo/settings'
import { addDays, reportingEndStr, type DateRange } from '@/kpi/dateRanges'
import { computeTankStatuses, type TankStatus } from '@/kpi/tankStatus'
import { computeTankReconciliation } from '@/kpi/tankReconciliation'
import { computeTankReceipts, type TankReceipt } from '@/kpi/tankReceipts'
import { computeTankForecast } from '@/kpi/tankForecast'
import { computeTankAlerts, type TankAlertSeverity } from '@/kpi/tankAlerts'
import { buildStockSeries, buildDiffSeries, buildTempSeries, buildInOutByDay, buildConsumptionByHour } from '@/kpi/tankSeries'
import { FUEL_LABELS, classifyFuel } from '@/kpi/tankFuel'
import { formatLei, formatNumber, formatDateRo } from '@/lib/format'
import { downloadSimpleTable } from '@/reports/tankTablesWorkbook'
import { TankSettingsPanel } from '@/pages/tanks/TankSettingsPanel'
import type { FuelMovement, FuelType, TankReading } from '@/types/domain'

type MovementFilterOpt = 'toate' | 'intrari' | 'iesiri' | 'vanzari' | 'corectii'

function matchesMovementFilter(m: FuelMovement, filter: MovementFilterOpt): boolean {
  if (filter === 'toate') return true
  if (filter === 'intrari') return m.direction === 'in'
  if (filter === 'iesiri') return m.direction === 'out'
  if (filter === 'vanzari') return /vanzare|vânzare/i.test(m.movementTypeRaw ?? '')
  return /ajustare|corect/i.test(m.movementTypeRaw ?? '')
}

const ALERT_TONE: Record<TankAlertSeverity, 'bad' | 'warn' | 'neutral'> = { red: 'bad', orange: 'warn', yellow: 'neutral' }

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TanksPage() {
  const { tankReadings, fuelMovements, settings, importBatches, refresh } = useDataStore()
  const [range, setRange] = useState<DateRange>({ start: addDays(reportingEndStr(), -29), end: reportingEndStr() })
  const [fuelFilter, setFuelFilter] = useState<FuelType | 'toate'>('toate')
  const [tankFilter, setTankFilter] = useState<string>('toate')
  const [movementFilter, setMovementFilter] = useState<MovementFilterOpt>('toate')
  const [sourceFilter, setSourceFilter] = useState<string>('toate')
  const [chartTankId, setChartTankId] = useState<string | null>(null)

  const tankSettings = useMemo(() => settings?.tankSettings ?? {}, [settings])

  const allTankIds = useMemo(() => {
    const set = new Set<string>()
    tankReadings.forEach((r) => set.add(r.tankId))
    fuelMovements.forEach((m) => {
      if (m.tankId) set.add(m.tankId)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [tankReadings, fuelMovements])

  const tankFuelLabels = useMemo(() => {
    const map: Record<string, string> = {}
    tankReadings.forEach((r) => {
      if (!map[r.tankId]) map[r.tankId] = FUEL_LABELS[r.fuel]
    })
    return map
  }, [tankReadings])

  const sourceBatches = useMemo(
    () => importBatches.filter((b) => b.kind === 'tankReadings' || b.kind === 'fuelMovements'),
    [importBatches],
  )

  const matchesTopFilters = useCallback(
    (fuel: FuelType, tankId: string | null, importBatchId: string) =>
      (fuelFilter === 'toate' || fuel === fuelFilter) &&
      (tankFilter === 'toate' || tankId === tankFilter) &&
      (sourceFilter === 'toate' || importBatchId === sourceFilter),
    [fuelFilter, tankFilter, sourceFilter],
  )

  const filteredReadings = useMemo(
    () => tankReadings.filter((r) => matchesTopFilters(r.fuel, r.tankId, r.importBatchId)),
    [tankReadings, matchesTopFilters],
  )
  const filteredMovementsAll = useMemo(
    () => fuelMovements.filter((m) => matchesTopFilters(m.fuel, m.tankId, m.importBatchId) && matchesMovementFilter(m, movementFilter)),
    [fuelMovements, matchesTopFilters, movementFilter],
  )
  const filteredMovementsInRange = useMemo(
    () => filteredMovementsAll.filter((m) => m.date >= range.start && m.date <= range.end),
    [filteredMovementsAll, range],
  )

  const statuses = useMemo(() => computeTankStatuses(filteredReadings, tankSettings), [filteredReadings, tankSettings])

  const effectiveChartTankId = chartTankId ?? statuses[0]?.tankId ?? allTankIds[0] ?? null
  const chartFuel: FuelType = effectiveChartTankId
    ? (statuses.find((s) => s.tankId === effectiveChartTankId)?.fuel ?? classifyFuel(effectiveChartTankId))
    : 'ALT'

  const reconciliation = useMemo(
    () => (effectiveChartTankId ? computeTankReconciliation(effectiveChartTankId, chartFuel, tankReadings, fuelMovements, range) : null),
    [effectiveChartTankId, chartFuel, tankReadings, fuelMovements, range],
  )

  const allReceipts = useMemo(() => computeTankReceipts(tankReadings, fuelMovements), [tankReadings, fuelMovements])
  const filteredReceipts = useMemo(
    () => allReceipts.filter((r) => (fuelFilter === 'toate' || r.fuel === fuelFilter) && (tankFilter === 'toate' || r.tankId === tankFilter)),
    [allReceipts, fuelFilter, tankFilter],
  )

  const forecasts = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeTankForecast>>()
    for (const s of statuses) {
      map.set(
        s.tankId,
        computeTankForecast(s.tankId, s.fuel, s.latest.actualVolume, tankReadings, fuelMovements, tankSettings[s.tankId] ?? null),
      )
    }
    return map
  }, [statuses, tankReadings, fuelMovements, tankSettings])

  const alerts = useMemo(
    () => computeTankAlerts(statuses, tankReadings, fuelMovements, allReceipts, forecasts),
    [statuses, tankReadings, fuelMovements, allReceipts, forecasts],
  )

  const stockSeries = effectiveChartTankId ? buildStockSeries(filteredReadings, effectiveChartTankId) : []
  const diffSeries = effectiveChartTankId ? buildDiffSeries(filteredReadings, effectiveChartTankId) : []
  const tempSeries = effectiveChartTankId ? buildTempSeries(filteredReadings, effectiveChartTankId) : []
  const inOutByDay = effectiveChartTankId ? buildInOutByDay(filteredMovementsInRange, effectiveChartTankId) : []
  const consumptionByHour = effectiveChartTankId ? buildConsumptionByHour(filteredMovementsInRange, effectiveChartTankId) : []

  async function saveTankSettings(next: typeof tankSettings) {
    await updateSettings({ tankSettings: next })
    await refresh()
  }

  if (tankReadings.length === 0 && fuelMovements.length === 0) {
    return (
      <div>
        <PageHeader title="Rezervoare & Mișcări" description="Citiri FCC și mișcări de stoc pentru combustibili — separat de Stoc & Rotație, care rămâne pentru produsele din magazin." />
        <EmptyState
          icon="⛽"
          title="Niciun import încă"
          description="Mergi la Import date → Citiri rezervoare FCC (sau Mișcări stoc combustibil) pentru a încărca primul export."
          actionTo="/import?kind=tankReadings"
          actionLabel="Mergi la Import"
        />
      </div>
    )
  }

  const receiptsColumns: DataTableColumn<TankReceipt>[] = [
    { key: 'timestamp', header: 'Data/Ora', render: (r) => fmtTs(r.timestamp), sortValue: (r) => r.timestamp },
    { key: 'tank', header: 'Rezervor', render: (r) => `${r.tankId} — ${r.fuelLabel}`, sortValue: (r) => r.tankId },
    { key: 'document', header: 'Document', render: (r) => r.documentNo ?? '—' },
    { key: 'before', header: 'Stoc înainte', align: 'right', render: (r) => (r.actualBefore != null ? formatNumber(r.actualBefore, 0) : '—'), sortValue: (r) => r.actualBefore ?? 0 },
    { key: 'after', header: 'Stoc după', align: 'right', render: (r) => (r.actualAfter != null ? formatNumber(r.actualAfter, 0) : '—'), sortValue: (r) => r.actualAfter ?? 0 },
    { key: 'doc', header: 'Cantitate document', align: 'right', render: (r) => (r.quantityFromDocument != null ? formatNumber(r.quantityFromDocument, 0) : '—'), sortValue: (r) => r.quantityFromDocument ?? 0 },
    { key: 'sold', header: 'Vândut în timpul descărcării', align: 'right', render: (r) => formatNumber(r.quantitySoldDuring, 0), sortValue: (r) => r.quantitySoldDuring },
    { key: 'physical', header: 'Recepționat fizic (estimat)', align: 'right', render: (r) => (r.quantityReceivedPhysical != null ? formatNumber(r.quantityReceivedPhysical, 0) : '—'), sortValue: (r) => r.quantityReceivedPhysical ?? 0 },
    { key: 'diffDoc', header: 'Diferență vs. document', align: 'right', render: (r) => (r.diffVsDocument != null ? formatNumber(r.diffVsDocument, 0) : '—'), sortValue: (r) => r.diffVsDocument ?? 0 },
    { key: 'temp', header: 'Temp. înainte/după', render: (r) => `${r.tempBefore != null ? formatNumber(r.tempBefore, 1) : '—'} / ${r.tempAfter != null ? formatNumber(r.tempAfter, 1) : '—'}` },
    { key: 'source', header: 'Sursă', render: (r) => <Badge tone={r.source === 'movement' ? 'brand' : 'warn'}>{r.source === 'movement' ? 'mișcare Intrare' : 'salt de stoc'}</Badge> },
    { key: 'estimate', header: '', render: (r) => (r.isEstimate ? <Badge tone="neutral">estimare</Badge> : null) },
  ]

  const readingColumns: DataTableColumn<TankReading>[] = [
    { key: 'date', header: 'Ultima actualizare', render: (r) => fmtTs(r.lastUpdate), sortValue: (r) => r.lastUpdate },
    { key: 'tank', header: 'Rezervor', render: (r) => r.tankId, sortValue: (r) => r.tankId },
    { key: 'fuel', header: 'Carburant', render: (r) => FUEL_LABELS[r.fuel], sortValue: (r) => r.fuel },
    { key: 'actual', header: 'Faptic', align: 'right', render: (r) => (r.actualVolume != null ? formatNumber(r.actualVolume, 2) : '—'), sortValue: (r) => r.actualVolume ?? 0 },
    { key: 'book', header: 'Scriptic', align: 'right', render: (r) => (r.bookStock != null ? formatNumber(r.bookStock, 2) : '—'), sortValue: (r) => r.bookStock ?? 0 },
    { key: 'diff', header: 'Diferență', align: 'right', render: (r) => (r.difference != null ? formatNumber(r.difference, 2) : '—'), sortValue: (r) => r.difference ?? 0 },
    { key: 'v15', header: 'Volum 15°C', align: 'right', render: (r) => (r.volume15C != null ? formatNumber(r.volume15C, 2) : '—'), sortValue: (r) => r.volume15C ?? 0 },
    { key: 'temp', header: 'Temperatură', align: 'right', render: (r) => (r.avgTemperature != null ? formatNumber(r.avgTemperature, 1) : '—'), sortValue: (r) => r.avgTemperature ?? 0 },
    { key: 'water', header: 'Apă', align: 'right', render: (r) => (r.waterVolume != null ? formatNumber(r.waterVolume, 2) : '—'), sortValue: (r) => r.waterVolume ?? 0 },
    { key: 'state', header: 'Stare', render: (r) => <Badge tone={r.connected ? 'good' : 'bad'}>{r.mainState}</Badge> },
  ]

  const movementColumns: DataTableColumn<FuelMovement>[] = [
    { key: 'date', header: 'Dată/Oră', render: (m) => `${formatDateRo(m.date)} ${m.time}`, sortValue: (m) => m.timestamp },
    { key: 'tank', header: 'Rezervor', render: (m) => m.tankId ?? '—', sortValue: (m) => m.tankId ?? '' },
    { key: 'product', header: 'Produs', render: (m) => m.productRaw, sortValue: (m) => m.productRaw },
    { key: 'type', header: 'Tip', render: (m) => m.movementTypeRaw ?? '—', sortValue: (m) => m.movementTypeRaw ?? '' },
    {
      key: 'qty',
      header: 'Cantitate',
      align: 'right',
      render: (m) => <span className={m.direction === 'out' ? 'text-bad' : 'text-good'}>{formatNumber(m.quantity, 2)}</span>,
      sortValue: (m) => m.quantity,
    },
    { key: 'stockAfter', header: 'Stoc după', align: 'right', render: (m) => (m.stockAfter != null ? formatNumber(m.stockAfter, 2) : '—'), sortValue: (m) => m.stockAfter ?? 0 },
    { key: 'doc', header: 'Document', render: (m) => m.documentNo ?? '—' },
    { key: 'price', header: 'Preț/Valoare', align: 'right', render: (m) => (m.price != null ? formatLei(m.price) : '—'), sortValue: (m) => m.price ?? 0 },
  ]

  return (
    <div>
      <PageHeader
        title="Rezervoare & Mișcări"
        description="Citiri FCC și mișcări de stoc pentru combustibili (Motorină, Benzină, GPL) — separat de Stoc & Rotație, care rămâne pentru produsele din magazin."
      />

      {/* ---------- filters ---------- */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="rounded-md border border-slate-200 px-2 py-1 text-xs" />
          <span className="text-slate-400">–</span>
          <input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="rounded-md border border-slate-200 px-2 py-1 text-xs" />
        </div>
        <select value={fuelFilter} onChange={(e) => setFuelFilter(e.target.value as FuelType | 'toate')} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
          <option value="toate">Toate carburanții</option>
          <option value="MOTORINA">Motorină</option>
          <option value="BENZINA">Benzină</option>
          <option value="GPL">GPL</option>
        </select>
        <select value={tankFilter} onChange={(e) => setTankFilter(e.target.value)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
          <option value="toate">Toate rezervoarele</option>
          {allTankIds.map((id) => (
            <option key={id} value={id}>
              {id} — {tankFuelLabels[id] ?? classifyFuel(id)}
            </option>
          ))}
        </select>
        <select value={movementFilter} onChange={(e) => setMovementFilter(e.target.value as MovementFilterOpt)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
          <option value="toate">Toate mișcările</option>
          <option value="intrari">Doar intrări</option>
          <option value="iesiri">Doar ieșiri</option>
          <option value="vanzari">Doar vânzări</option>
          <option value="corectii">Doar corecții</option>
        </select>
        {sourceBatches.length > 0 && (
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
            <option value="toate">Toate sursele</option>
            {sourceBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.filename}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ---------- alerts ---------- */}
      {alerts.length > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Alerte ({alerts.length})</h3>
          <ul className="space-y-1.5">
            {alerts.slice(0, 30).map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-sm">
                <Badge tone={ALERT_TONE[a.severity]}>{fmtTs(a.timestamp)}</Badge>
                <span className="text-slate-700">{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- per-tank cards ---------- */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statuses.map((s) => (
          <TankCard key={s.tankId} status={s} />
        ))}
      </div>

      {/* ---------- charts ---------- */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Grafice</h3>
          <select value={effectiveChartTankId ?? ''} onChange={(e) => setChartTankId(e.target.value)} className="rounded-md border border-slate-200 px-2 py-1 text-xs">
            {allTankIds.map((id) => (
              <option key={id} value={id}>
                {id} — {tankFuelLabels[id] ?? classifyFuel(id)}
              </option>
            ))}
          </select>
        </div>
        {!effectiveChartTankId ? (
          <p className="text-sm text-slate-400">Niciun rezervor identificat.</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Evoluția stocului — faptic, scriptic, volum la 15°C (litri)</p>
              <MultiLineChart
                data={stockSeries as unknown as Record<string, unknown>[]}
                series={[
                  { key: 'actualVolume', label: 'Faptic', color: '#1fa46c' },
                  { key: 'bookStock', label: 'Scriptic', color: '#2a78d6' },
                  { key: 'volume15C', label: 'Volum 15°C', color: '#eb6834' },
                ]}
                xTickFormatter={(v) => fmtTs(Number(v))}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Evoluția diferenței — litri (stânga) și % din scriptic (dreapta)</p>
              <MultiLineChart
                data={diffSeries as unknown as Record<string, unknown>[]}
                series={[
                  { key: 'difference', label: 'Diferență (L)', color: '#d03b3b' },
                  { key: 'diffPct', label: 'Diferență (%)', color: '#fab219', yAxisId: 'right' },
                ]}
                xTickFormatter={(v) => fmtTs(Number(v))}
                rightYFormatter={(v) => `${formatNumber(v, 1)}%`}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Intrări și ieșiri pe zi (litri) — perioada selectată</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={inOutByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => formatDateRo(d).slice(0, 5)} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                  <RTooltip labelFormatter={(d) => formatDateRo(String(d))} formatter={(v) => formatNumber(Number(v), 0)} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                  <RLegend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="totalIn" name="Intrări" fill="#1fa46c" />
                  <Bar dataKey="totalOut" name="Ieșiri" fill="#d03b3b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Temperatură medie și volum corectat la 15°C</p>
              <MultiLineChart
                data={tempSeries as unknown as Record<string, unknown>[]}
                series={[
                  { key: 'avgTemperature', label: 'Temperatură (°C)', color: '#fab219' },
                  { key: 'volume15C', label: 'Volum 15°C (L)', color: '#2a78d6', yAxisId: 'right' },
                ]}
                xTickFormatter={(v) => fmtTs(Number(v))}
                rightYFormatter={(v) => formatNumber(v, 0)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Consum pe ore ale zilei (litri, însumat pe toată perioada)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={consumptionByHour} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}h`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={56} />
                  <RTooltip labelFormatter={(h) => `Ora ${h}`} formatter={(v) => formatNumber(Number(v), 0)} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="total" name="Consum" fill="#2a78d6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ---------- reconciliation ---------- */}
      {reconciliation && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-700">
            Reconciliere stoc — {reconciliation.tankId} ({reconciliation.fuelLabel}), {formatDateRo(range.start)} – {formatDateRo(range.end)}
          </h3>
          <p className="mb-3 text-xs text-slate-500">
            Stoc scriptic calculat = scriptic inițial + intrări − ieșiri. Abaterea neexplicată = faptic final − (faptic
            inițial + intrări − ieșiri) — izolează pierderea/câștigul real de decalajul scriptic-faptic deja existent
            la începutul perioadei.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <ReconStat label="Stoc faptic inițial" value={reconciliation.actualStart} />
            <ReconStat label="Stoc scriptic inițial" value={reconciliation.bookStockStart} />
            <ReconStat label="Total intrări" value={reconciliation.totalIn} tone="good" />
            <ReconStat label="Total ieșiri/vânzări" value={reconciliation.totalOut} tone="bad" />
            <ReconStat label="Stoc scriptic calculat" value={reconciliation.bookStockCalculatedEnd} />
            <ReconStat label="Stoc faptic final" value={reconciliation.actualEnd} />
            <ReconStat label="Stoc scriptic final" value={reconciliation.bookStockEnd} />
            <ReconStat label="Diferență finală" value={reconciliation.diffEnd} signed />
            <ReconStat label="Variația diferenței" value={reconciliation.diffChange} signed />
            <ReconStat label="Pierdere/câștig neexplicat" value={reconciliation.unexplained} signed tone="warn" />
          </div>
        </div>
      )}

      {/* ---------- indicators / forecast ---------- */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Indicatori și prognoză</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
          <table className="min-w-full divide-y divide-slate-100 text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1.5">Rezervor</th>
                <th className="px-2 py-1.5 text-right">Consum mediu 7 zile</th>
                <th className="px-2 py-1.5 text-right">Consum mediu 14 zile</th>
                <th className="px-2 py-1.5 text-right">Consum mediu 30 zile</th>
                <th className="px-2 py-1.5 text-right">Consum maxim/zi</th>
                <th className="px-2 py-1.5 text-right">Zile de stoc rămase</th>
                <th className="px-2 py-1.5">Epuizare estimată</th>
                <th className="px-2 py-1.5 text-right">Comandă recomandată</th>
                <th className="px-2 py-1.5">Trend diferență</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {statuses.map((s) => {
                const f = forecasts.get(s.tankId)
                if (!f) return null
                return (
                  <tr key={s.tankId}>
                    <td className="px-2 py-1.5 font-medium text-slate-700">{s.tankId} — {s.fuelLabel}</td>
                    <td className="px-2 py-1.5 text-right">{f.avgPerDay7 != null ? formatNumber(f.avgPerDay7, 1) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{f.avgPerDay14 != null ? formatNumber(f.avgPerDay14, 1) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{f.avgPerDay30 != null ? formatNumber(f.avgPerDay30, 1) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{f.maxDailyConsumption != null ? formatNumber(f.maxDailyConsumption, 0) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">{f.daysRemaining != null ? formatNumber(f.daysRemaining, 1) : '—'}</td>
                    <td className="px-2 py-1.5">{f.estimatedStockoutDate ? formatDateRo(f.estimatedStockoutDate) : '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      {f.recommendedOrderQty != null ? formatNumber(f.recommendedOrderQty, 0) + ' L' : <span className="text-slate-400">necesită capacitate</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {f.diffTrend ? (
                        <Badge tone={f.diffTrend === 'crescator' ? 'warn' : f.diffTrend === 'descrescator' ? 'good' : 'neutral'}>
                          {f.diffTrend === 'crescator' ? 'în creștere' : f.diffTrend === 'descrescator' ? 'în scădere' : 'stabilă'}
                        </Badge>
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

        <div className="mt-5 border-t border-slate-100 pt-4">
          <h4 className="mb-1 text-sm font-semibold text-slate-700">Setări rezervoare</h4>
          <p className="mb-3 text-xs text-slate-500">
            Fără capacitate configurată nu se calculează procentul de umplere sau comanda recomandată.
          </p>
          <TankSettingsPanel tankIds={allTankIds} tankFuelLabels={tankFuelLabels} tankSettings={tankSettings} onSave={saveTankSettings} />
        </div>
      </div>

      {/* ---------- tables ---------- */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Recepții detectate</h3>
          <button
            onClick={() =>
              downloadSimpleTable(
                'Receptii_rezervoare.xlsx',
                'Recepții',
                ['Data/Ora', 'Rezervor', 'Carburant', 'Document', 'Stoc înainte', 'Stoc după', 'Cantitate document', 'Vândut în timpul descărcării', 'Recepționat fizic', 'Diferență vs. document', 'Sursă'],
                filteredReceipts.map((r) => [
                  fmtTs(r.timestamp), r.tankId, r.fuelLabel, r.documentNo ?? '', r.actualBefore ?? '', r.actualAfter ?? '', r.quantityFromDocument ?? '', r.quantitySoldDuring, r.quantityReceivedPhysical ?? '', r.diffVsDocument ?? '', r.source,
                ]),
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ⬇ Exportă Excel
          </button>
        </div>
        <DataTable columns={receiptsColumns} rows={filteredReceipts} rowKey={(r) => `${r.tankId}-${r.timestamp}`} searchable searchPredicate={(r, q) => r.tankId.toLowerCase().includes(q) || r.fuelLabel.toLowerCase().includes(q)} defaultSortKey="timestamp" pageSize={20} />
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Citiri FCC</h3>
          <button
            onClick={() =>
              downloadSimpleTable(
                'Citiri_FCC.xlsx',
                'Citiri',
                ['Ultima actualizare', 'Rezervor', 'Carburant', 'Faptic', 'Scriptic', 'Diferență', 'Volum 15°C', 'Temperatură', 'Apă', 'Stare'],
                filteredReadings.map((r) => [fmtTs(r.lastUpdate), r.tankId, FUEL_LABELS[r.fuel], r.actualVolume ?? '', r.bookStock ?? '', r.difference ?? '', r.volume15C ?? '', r.avgTemperature ?? '', r.waterVolume ?? '', r.mainState]),
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ⬇ Exportă Excel
          </button>
        </div>
        <DataTable columns={readingColumns} rows={filteredReadings} rowKey={(r) => r.id} searchable searchPredicate={(r, q) => r.tankId.toLowerCase().includes(q)} defaultSortKey="date" pageSize={25} />
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Mișcări de stoc</h3>
          <button
            onClick={() =>
              downloadSimpleTable(
                'Miscari_stoc_combustibil.xlsx',
                'Mișcări',
                ['Dată', 'Ora', 'Rezervor', 'Produs', 'Tip', 'Cantitate', 'Stoc după', 'Document', 'Preț/Valoare'],
                filteredMovementsInRange.map((m) => [m.date, m.time, m.tankId ?? '', m.productRaw, m.movementTypeRaw ?? '', m.quantity, m.stockAfter ?? '', m.documentNo ?? '', m.price ?? '']),
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            ⬇ Exportă Excel
          </button>
        </div>
        <DataTable columns={movementColumns} rows={filteredMovementsInRange} rowKey={(m) => m.id} searchable searchPredicate={(m, q) => m.productRaw.toLowerCase().includes(q) || (m.documentNo ?? '').toLowerCase().includes(q)} defaultSortKey="date" pageSize={25} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Reconciliere zilnică</h3>
        <p className="mb-3 text-xs text-slate-500">Stoc scriptic calculat vs. faptic măsurat, zi cu zi, pentru rezervorul selectat la grafice.</p>
        <DailyReconciliationTable tankId={effectiveChartTankId} readings={tankReadings} movements={fuelMovements} range={range} />
      </div>
    </div>
  )
}

function ReconStat({ label, value, signed, tone }: { label: string; value: number | null; signed?: boolean; tone?: 'good' | 'bad' | 'warn' }) {
  const color = value == null ? 'text-slate-400' : tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? (Math.abs(value) > 0 ? 'text-warn' : 'text-slate-900') : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${color}`}>
        {value == null ? '—' : `${signed && value >= 0 ? '+' : ''}${formatNumber(value, 0)} L`}
      </p>
    </div>
  )
}

function TankCard({ status }: { status: TankStatus }) {
  const { tankId, fuelLabel, latest, diffPct, fillPct } = status
  const diffTone = latest.difference == null ? 'neutral' : Math.abs(diffPct ?? 0) > 3 ? 'bad' : Math.abs(diffPct ?? 0) > 1 ? 'warn' : 'good'
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">{fuelLabel}</p>
          <p className="text-xs text-slate-400">Rezervor {tankId}</p>
        </div>
        <Badge tone={latest.connected ? 'good' : 'bad'}>{latest.mainState}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Stoc faptic" value={latest.actualVolume != null ? `${formatNumber(latest.actualVolume, 0)} L` : '—'} />
        <Stat label="Stoc scriptic" value={latest.bookStock != null ? `${formatNumber(latest.bookStock, 0)} L` : '—'} />
        <Stat
          label="Diferență"
          value={latest.difference != null ? `${latest.difference >= 0 ? '+' : ''}${formatNumber(latest.difference, 0)} L` : '—'}
          tone={diffTone}
        />
        <Stat label="Diferență %" value={diffPct != null ? `${diffPct >= 0 ? '+' : ''}${formatNumber(diffPct, 2)}%` : '—'} tone={diffTone} />
        <Stat label="Volum 15°C" value={latest.volume15C != null ? `${formatNumber(latest.volume15C, 0)} L` : '—'} />
        <Stat label="Temperatură" value={latest.avgTemperature != null ? `${formatNumber(latest.avgTemperature, 1)}°C` : '—'} />
        <Stat label="Nivel" value={latest.level != null ? `${formatNumber(latest.level, 0)} mm` : '—'} />
        <Stat label="Apă" value={(latest.waterVolume ?? 0) > 0 ? `${formatNumber(latest.waterVolume ?? 0, 1)} L` : 'nu'} tone={(latest.waterVolume ?? 0) > 0 ? 'bad' : 'good'} />
      </div>
      {fillPct != null && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span>Umplere</span>
            <span>{formatNumber(fillPct, 0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(100, fillPct))}%` }} />
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Actualizat: {fmtTs(latest.lastUpdate)}</p>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' | 'neutral' }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-slate-800'
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`font-medium ${color}`}>{value}</p>
    </div>
  )
}

function DailyReconciliationTable({
  tankId,
  readings,
  movements,
  range,
}: {
  tankId: string | null
  readings: TankReading[]
  movements: FuelMovement[]
  range: DateRange
}) {
  const rows = useMemo(() => {
    if (!tankId) return []
    const days: string[] = []
    let d = range.start
    while (d <= range.end) {
      days.push(d)
      d = addDays(d, 1)
    }
    const fuel = readings.find((r) => r.tankId === tankId)?.fuel ?? classifyFuel(tankId)
    return days.map((day) => {
      const rec = computeTankReconciliation(tankId, fuel, readings, movements, { start: day, end: day })
      return { day, ...rec }
    })
  }, [tankId, readings, movements, range])

  if (!tankId) return <p className="text-sm text-slate-400">Niciun rezervor selectat.</p>
  if (rows.length === 0) return <p className="text-sm text-slate-400">Nicio zi în perioada selectată.</p>

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
      <table className="min-w-full divide-y divide-slate-100 text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-slate-400">
            <th className="px-2 py-1.5">Zi</th>
            <th className="px-2 py-1.5 text-right">Scriptic calculat</th>
            <th className="px-2 py-1.5 text-right">Faptic final</th>
            <th className="px-2 py-1.5 text-right">Diferență</th>
            <th className="px-2 py-1.5 text-right">Neexplicat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r) => (
            <tr key={r.day}>
              <td className="px-2 py-1.5">{formatDateRo(r.day)}</td>
              <td className="px-2 py-1.5 text-right">{r.bookStockCalculatedEnd != null ? formatNumber(r.bookStockCalculatedEnd, 0) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.actualEnd != null ? formatNumber(r.actualEnd, 0) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.diffEnd != null ? formatNumber(r.diffEnd, 0) : '—'}</td>
              <td className="px-2 py-1.5 text-right">{r.unexplained != null ? formatNumber(r.unexplained, 0) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
