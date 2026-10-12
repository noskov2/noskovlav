interface BreakdownHintButtonProps {
  onClick: () => void
  children: React.ReactNode
}

// The small "N linii · detalii pe X" link used as a KpiCard's `hint`, opening
// a PeriodBreakdownModal — same visual treatment as DrillValue so both kinds
// of drill-down (raw lines vs. per-label breakdown) read as the same affordance.
export function BreakdownHintButton({ onClick, children }: BreakdownHintButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded underline decoration-dotted decoration-slate-300 underline-offset-2 transition hover:text-brand-600 hover:decoration-brand-400"
    >
      {children}
    </button>
  )
}
