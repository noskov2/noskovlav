import { db } from '@/data/db'
import { slugify } from '@/lib/id'
import type { Cashier } from '@/types/domain'
import { reassignCashier } from '@/data/repo/transactions'

// Backfills fields added to Cashier after real records were already saved
// (teamHistory, resignedAt, resignedNote) — a cashier stored before this
// feature shipped simply doesn't have these keys in IndexedDB at all, so
// every read must normalize them to safe defaults right here, once, rather
// than every caller guessing whether `.teamHistory` might be undefined.
// Without this, `cashier.teamHistory.length`/`.filter`/spreads throw on
// any pre-existing real cashier the moment a page tries to filter/resolve
// their team — which broke the whole app on first load for real data.
function normalizeCashier(c: Cashier): Cashier {
  return {
    ...c,
    teamHistory: c.teamHistory ?? [],
    resignedAt: c.resignedAt ?? null,
    resignedNote: c.resignedNote ?? null,
  }
}

export async function listCashiers(): Promise<Cashier[]> {
  const all = await db.cashiers.toArray()
  return all.map(normalizeCashier)
}

export async function getCashier(id: string): Promise<Cashier | undefined> {
  const c = await db.cashiers.get(id)
  return c ? normalizeCashier(c) : undefined
}

export async function upsertCashier(cashier: Cashier): Promise<void> {
  await db.cashiers.put(cashier)
}

export async function deleteCashier(id: string): Promise<void> {
  await db.cashiers.delete(id)
}

export async function bulkSetCashiers(cashiers: Cashier[]): Promise<void> {
  await db.cashiers.bulkPut(cashiers)
}

// Pure "brand-new cashier" construction, shared by resolveOrCreateCashier
// (single DB-backed lookup) and the in-memory batch resolver a large sales
// import uses — see buildNewProduct in repo/products.ts for why.
export function buildNewCashier(rawName: string): Cashier {
  const trimmed = rawName.trim() || 'Necunoscut'
  return {
    id: slugify(trimmed) || `cashier-${Date.now()}`,
    name: trimmed,
    aliases: [trimmed],
    active: true,
    teamId: null,
    teamHistory: [],
    resignedAt: null,
    resignedNote: null,
    createdAt: Date.now(),
  }
}

// Records a team change effective on `from` — appends to the history rather
// than overwriting it, so past sales stay attributed to whichever team was
// actually current on their own date (see buildTeamAsOfResolver). `teamId`
// (the "current team" convenience field) is recomputed from the full
// history so a past-dated correction never wrongly becomes "current" over a
// more recent entry.
export async function changeCashierTeam(cashierId: string, teamId: string | null, from: string): Promise<void> {
  const raw = await db.cashiers.get(cashierId)
  if (!raw) return
  const cashier = normalizeCashier(raw)
  // Replacing any existing entry for the exact same date lets a mistaken
  // entry be corrected by just re-applying the change with the same date,
  // instead of piling up duplicate entries for one real event.
  const history = [...cashier.teamHistory.filter((e) => e.from !== from), { teamId, from }].sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
  )
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentEntry = [...history].reverse().find((e) => e.from <= todayStr)
  await db.cashiers.put({ ...cashier, teamHistory: history, teamId: currentEntry?.teamId ?? teamId })
}

// Deletes one team-history entry (e.g. a wrongly-dated correction) and
// recomputes the current-team convenience field from what's left.
export async function removeTeamHistoryEntry(cashierId: string, from: string): Promise<void> {
  const raw = await db.cashiers.get(cashierId)
  if (!raw) return
  const cashier = normalizeCashier(raw)
  const history = cashier.teamHistory.filter((e) => e.from !== from)
  const todayStr = new Date().toISOString().slice(0, 10)
  const currentEntry = [...history].reverse().find((e) => e.from <= todayStr)
  await db.cashiers.put({ ...cashier, teamHistory: history, teamId: currentEntry?.teamId ?? null })
}

export async function setCashierResignation(cashierId: string, resignedAt: string | null, note: string | null): Promise<void> {
  const cashier = await db.cashiers.get(cashierId)
  if (!cashier) return
  await db.cashiers.put({
    ...cashier,
    resignedAt,
    resignedNote: resignedAt ? note : null,
    active: resignedAt ? false : cashier.active,
  })
}

/**
 * Resolves a raw cashier name from an import to a canonical Cashier record,
 * creating one on first sight. This is what lets "Razvan P.", "razvan" and
 * "RAZVAN POPESCU" in different exports be linked to one person once the
 * user merges the aliases in the Casieri config screen.
 */
export async function resolveOrCreateCashier(rawName: string): Promise<Cashier> {
  const trimmed = rawName.trim() || 'Necunoscut'
  const existingByAlias = await db.cashiers.filter((c) => c.aliases.includes(trimmed)).first()
  if (existingByAlias) return existingByAlias

  const id = slugify(trimmed) || `cashier-${Date.now()}`
  const existingById = await db.cashiers.get(id)
  if (existingById) {
    if (!existingById.aliases.includes(trimmed)) {
      const updated = { ...existingById, aliases: [...existingById.aliases, trimmed] }
      await db.cashiers.put(updated)
      return updated
    }
    return existingById
  }

  const cashier = buildNewCashier(rawName)
  await db.cashiers.put(cashier)
  return cashier
}

/**
 * Merges `sourceId` into `targetId`: reassigns every transaction, folds the
 * alias lists together, and deletes the source record. Used when the same
 * person appears under different names/spellings across exports.
 */
export async function mergeCashiers(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return
  const [source, target] = await Promise.all([db.cashiers.get(sourceId), db.cashiers.get(targetId)])
  if (!source || !target) return

  await reassignCashier(sourceId, targetId)
  const mergedAliases = Array.from(new Set([...target.aliases, ...source.aliases]))
  await db.cashiers.put({ ...target, aliases: mergedAliases })
  await db.cashiers.delete(sourceId)
}
