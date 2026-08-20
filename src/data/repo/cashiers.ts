import { db } from '@/data/db'
import { slugify } from '@/lib/id'
import type { Cashier } from '@/types/domain'
import { reassignCashier } from '@/data/repo/transactions'

export async function listCashiers(): Promise<Cashier[]> {
  return db.cashiers.toArray()
}

export async function getCashier(id: string): Promise<Cashier | undefined> {
  return db.cashiers.get(id)
}

export async function upsertCashier(cashier: Cashier): Promise<void> {
  await db.cashiers.put(cashier)
}

export async function deleteCashier(id: string): Promise<void> {
  await db.cashiers.delete(id)
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

  const cashier: Cashier = {
    id,
    name: trimmed,
    aliases: [trimmed],
    active: true,
    teamId: null,
    createdAt: Date.now(),
  }
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
