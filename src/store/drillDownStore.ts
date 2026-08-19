import { create } from 'zustand'
import type { TransactionLine } from '@/types/domain'

interface DrillDownState {
  open: boolean
  title: string
  subtitle: string | null
  lines: TransactionLine[]
  show: (title: string, lines: TransactionLine[], subtitle?: string) => void
  close: () => void
}

// Any KPI value in the app can be clicked to open this modal with the
// exact transaction lines that produced it — this is the single shared
// implementation of the "drill-down" requirement so every module gets it
// for free by calling useDrillDownStore.getState().show(...).
export const useDrillDownStore = create<DrillDownState>((set) => ({
  open: false,
  title: '',
  subtitle: null,
  lines: [],
  show: (title, lines, subtitle) => set({ open: true, title, lines, subtitle: subtitle ?? null }),
  close: () => set({ open: false }),
}))
