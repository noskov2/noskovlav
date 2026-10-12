// Shared row shape for any "one row per label, counted across three time
// windows" Dashboard drill-down (promoții by promo label, cafele/sandwich-uri
// by product name, ...) — lets a single modal/table component render all of
// them instead of each KPI card growing its own bespoke markup.
export interface PeriodBreakdownRow {
  key: string
  label: string
  current: { count: number; value: number }
  prevSamePeriod: { count: number; value: number }
  prevFullMonth: { count: number; value: number }
}
