import type { ReactNode } from 'react'
import { useDrillDownStore } from '@/store/drillDownStore'
import type { TransactionLine } from '@/types/domain'

interface DrillValueProps {
  children: ReactNode
  title: string
  subtitle?: string
  lines: TransactionLine[]
  className?: string
}

// Wraps any KPI number so a click opens the shared drill-down modal with
// the exact transactions behind it. This is the building block every page
// uses to satisfy "orice KPI important trebuie să poată fi verificat".
export function DrillValue({ children, title, subtitle, lines, className }: DrillValueProps) {
  const show = useDrillDownStore((s) => s.show)
  return (
    <button
      type="button"
      onClick={() => show(title, lines, subtitle)}
      className={
        className ??
        'rounded underline decoration-dotted decoration-slate-300 underline-offset-2 transition hover:text-brand-600 hover:decoration-brand-400'
      }
      title="Vezi tranzacțiile"
    >
      {children}
    </button>
  )
}
