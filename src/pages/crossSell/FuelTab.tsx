import type { ReactNode } from 'react'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { DrillValue } from '@/components/ui/DrillValue'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { formatNumber, formatPct } from '@/lib/format'
import { fuelReceiptLines, type CrossSellTabProps } from '@/pages/crossSell/shared'

export function FuelTab({ transactions, products, report }: CrossSellTabProps) {
  const columns: DataTableColumn<CashierCrossSellRow>[] = [
    { key: 'name', header: 'Casier', render: (r) => r.cashier.name, sortValue: (r) => r.cashier.name },
    {
      key: 'fuel',
      header: 'Bonuri carburant',
      align: 'right',
      render: (r) => (
        <DrillValue
          title={`${r.cashier.name} — bonuri cu carburant`}
          lines={fuelReceiptLines(transactions, products, r.cashier.id, false)}
        >
          {formatNumber(r.fuelReceipts)}
        </DrillValue>
      ),
      sortValue: (r) => r.fuelReceipts,
    },
    {
      key: 'combo',
      header: 'Bonuri carburant + marfă',
      align: 'right',
      render: (r) => (
        <DrillValue
          title={`${r.cashier.name} — bonuri carburant + marfă`}
          lines={fuelReceiptLines(transactions, products, r.cashier.id, true)}
        >
          {formatNumber(r.fuelPlusGoodsReceipts)}
        </DrillValue>
      ),
      sortValue: (r) => r.fuelPlusGoodsReceipts,
    },
    {
      key: 'pct',
      header: 'Cross-sell %',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatPct(r.crossSellPct)}</span>,
      sortValue: (r) => r.crossSellPct,
    },
  ]

  return (
    <div>
      <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <strong>Formula:</strong> bonuri cu carburant + marfă / total bonuri cu carburant × 100
      </div>
      <StationSummary report={report} transactions={transactions} products={products} />
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={[...report.cashiers].sort((a, b) => b.crossSellPct - a.crossSellPct)}
          rowKey={(r) => r.cashier.id}
          defaultSortKey="pct"
        />
      </div>
    </div>
  )
}

function StationSummary({ report, transactions, products }: CrossSellTabProps) {
  const s = report.stationTotal
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat
        label="Bonuri carburant (stație)"
        value={
          <DrillValue title="Bonuri carburant — total stație" lines={fuelReceiptLines(transactions, products, '__station__', false)}>
            {formatNumber(s.fuelReceipts)}
          </DrillValue>
        }
      />
      <Stat
        label="Bonuri carburant + marfă"
        value={
          <DrillValue title="Bonuri carburant + marfă — total stație" lines={fuelReceiptLines(transactions, products, '__station__', true)}>
            {formatNumber(s.fuelPlusGoodsReceipts)}
          </DrillValue>
        }
      />
      <Stat label="Cross-sell stație" value={formatPct(s.crossSellPct)} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}
