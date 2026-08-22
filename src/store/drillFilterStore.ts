import { create } from 'zustand'

// Carries a one-shot "these exact products" filter from an Action Center
// click (or any other summary-number-with-a-link) to the page it navigates
// to, so "88 produse cu risc de ruptură" actually lands on those 88
// products instead of an unfiltered list the user has to re-derive by eye.
// Consumed once via `consume(path)` — a page only picks up a pending
// filter addressed to its own route, and it's cleared immediately after
// being read so it doesn't silently reapply on a later, unrelated visit.
interface DrillFilterState {
  pending: { targetPath: string; productIds: string[] } | null
  setPending: (targetPath: string, productIds: string[]) => void
  consume: (path: string) => string[] | null
}

export const useDrillFilterStore = create<DrillFilterState>((set, get) => ({
  pending: null,
  setPending: (targetPath, productIds) => set({ pending: { targetPath, productIds } }),
  consume: (path) => {
    const { pending } = get()
    if (!pending || pending.targetPath !== path) return null
    set({ pending: null })
    return pending.productIds
  },
}))
