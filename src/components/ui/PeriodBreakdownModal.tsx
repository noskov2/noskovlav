import { Modal } from '@/components/ui/Modal'
import { DeltaBadge } from '@/components/ui/DeltaBadge'
import { computeDelta } from '@/kpi/monthComparison'
import { formatDateRo, formatLei, formatNumber } from '@/lib/format'
import { monthLabel, type DateRange } from '@/kpi/dateRanges'
import type { PeriodBreakdownRow } from '@/kpi/periodBreakdown'

interface PeriodBreakdownModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  labelColumnHeader: string
  emptyMessage: string
  rows: PeriodBreakdownRow[]
  range: DateRange
  prevRange: DateRange
  prevMonthFullRange: DateRange
}

// Shared "one label, three time windows" breakdown table — reused by every
// Dashboard KPI card whose drill-down needs "cât acum, cât aceeași perioadă
// luna trecută, cât toată luna trecută" instead of just a raw transaction
// list (see promoBreakdown.ts / productBreakdown.ts for the two row sources
// currently feeding it).
export function PeriodBreakdownModal({
  open,
  onClose,
  title,
  subtitle,
  labelColumnHeader,
  emptyMessage,
  rows,
  range,
  prevRange,
  prevMonthFullRange,
}: PeriodBreakdownModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} wide>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">{labelColumnHeader}</th>
                <th className="py-2 pr-3 text-right">
                  {formatDateRo(range.start)} – {formatDateRo(range.end)}
                  <div className="font-normal normal-case text-slate-400">(perioada curentă)</div>
                </th>
                <th className="py-2 pr-3 text-right">
                  {formatDateRo(prevRange.start)} – {formatDateRo(prevRange.end)}
                  <div className="font-normal normal-case text-slate-400">(lună trecută, aceeași perioadă)</div>
                </th>
                <th className="py-2 text-right">
                  {monthLabel(prevMonthFullRange.start)}
                  <div className="font-normal normal-case text-slate-400">(lună trecută, toată luna)</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row) => {
                const delta = computeDelta(row.current.count, row.prevSamePeriod.count)
                return (
                  <tr key={row.key}>
                    <td className="py-2 pr-3 font-medium text-slate-800">{row.label}</td>
                    <td className="py-2 pr-3 text-right">
                      <div className="font-semibold text-slate-800">{formatNumber(row.current.count)}</div>
                      <div className="text-xs text-slate-400">{formatLei(row.current.value)}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-semibold text-slate-800">{formatNumber(row.prevSamePeriod.count)}</span>
                        <DeltaBadge delta={delta} />
                      </div>
                      <div className="text-xs text-slate-400">{formatLei(row.prevSamePeriod.value)}</div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="font-semibold text-slate-800">{formatNumber(row.prevFullMonth.count)}</div>
                      <div className="text-xs text-slate-400">{formatLei(row.prevFullMonth.value)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
